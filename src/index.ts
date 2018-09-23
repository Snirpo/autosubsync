import * as VAD from "node-vad";
import {Srt, SrtLine} from "./srt/srt";
import {FFMPEGStream} from "./streams/ffmpeg-stream";
import {RecognizerStream} from "./streams/recognizer-stream";
import {MatcherStream} from "./streams/matcher-stream";
import {StreamUtils} from "./util/stream-utils";
import * as fs from "fs";
import * as path from "path";
import {LOGGER} from "./logger/logger";
import * as globby from "globby";

const audioFrequency = 16000.0;
const bitsPerSample = 16; // multiple of 8

const SUPPORTED_LANGUAGES = {
    "en": "en-US",
    "nl": "nl-NL"
    //TODO: add more
};

export interface AutoSubSyncOptions {
    seekTime?: number,
    duration?: number,

    matchTreshold?: number,
    minWordMatchCount?: number,

    overwrite?: boolean,
    postfix?: string,
    dryRun?: boolean,

    vad?: boolean,
    language?: string
}

export class AutoSubSync {

    static synchronizeAll(videoFile: string,
                          {
                              seekTime = 600,
                              duration = 15,
                              matchTreshold = 0.80,
                              minWordMatchCount = 4,
                              overwrite = false,
                              postfix = 'synced',
                              dryRun = false,
                              vad = true,
                              language = null
                          }: AutoSubSyncOptions = {}) {
        return globby(`${path.dirname(videoFile)}/${path.basename(videoFile, path.extname(videoFile))}*.srt`).then((srtFiles: string[]) => {
            srtFiles = srtFiles.filter(srtFile => {
                const basename = path.basename(srtFile, ".srt");
                const last = basename.split(".").pop();
                return !(last === "synced" || last === postfix);
            });
            LOGGER.verbose(`Srt files found: ${srtFiles}`);
            if (!language) {
                return Promise.all(srtFiles.map(srtFile => {
                    const basename = path.basename(srtFile, ".srt");
                    const lang = basename.split(".").pop();
                    if (SUPPORTED_LANGUAGES[lang]) {
                        LOGGER.verbose(`Lang ${lang} supported, mapping to ${SUPPORTED_LANGUAGES[lang]}`);
                        return AutoSubSync.synchronize(videoFile, srtFile, {
                            ...arguments[1],
                            language: SUPPORTED_LANGUAGES[lang]
                        })
                    }
                    LOGGER.verbose(`Lang ${lang} not supported, falling back to en-US`);
                    return AutoSubSync.synchronize(videoFile, srtFile, {
                        ...arguments[1],
                        language: "en-US"
                    })
                }))
            }
            return Promise.all(srtFiles.map(srtFile => AutoSubSync.synchronize(videoFile, srtFile, arguments[1])));
        })
    }

    static synchronize(videoFile: string,
                       srtFile: string,
                       {
                           seekTime = 600,
                           duration = 15,
                           matchTreshold = 0.80,
                           minWordMatchCount = 4,
                           overwrite = false,
                           postfix = 'synced',
                           dryRun = false,
                           vad = true,
                           language = "en-US"
                       }: AutoSubSyncOptions = {}) {
        return Srt.readLinesFromStream(fs.createReadStream(srtFile))
            .then(lines => {
                const ffMpegStream = FFMPEGStream.create(videoFile, {
                    bitsPerSample: bitsPerSample,
                    audioFrequency: audioFrequency,
                    seekTime: seekTime,
                    duration: duration
                });

                const vadStream = VAD.createStream({
                    audioFrequency: audioFrequency,
                    debounceTime: 1000,
                    mode: VAD.Mode.NORMAL
                });

                const matcherStream = MatcherStream.create(lines, {
                    seekTime: seekTime * 1000,
                    matchTreshold: matchTreshold,
                    minWordMatchCount: minWordMatchCount
                });

                const speechConfig = {
                    encoding: 'LINEAR16',
                    sampleRateHertz: audioFrequency,
                    languageCode: language,
                    model: language === "en-US" ? "video" : "default", // video profile is only supported in en-US for now
                    enableWordTimeOffsets: true
                };
                LOGGER.debug(`Speech config`, speechConfig);

                LOGGER.debug(`VAD enabled ${vad}`);
                const promise = vad ?
                    StreamUtils.toPromise(ffMpegStream, vadStream, RecognizerStream.create(speechConfig), matcherStream) :
                    StreamUtils.toPromise(ffMpegStream, RecognizerStream.createWithoutVAD(speechConfig), matcherStream);

                return promise
                    .then((matches: any[]) => {
                        const avgDiff = Math.floor(matches.reduce((total, curr) => {
                            return total + (curr.line.startTime - curr.hyp.startTime);
                        }, 0) / matches.length);
                        LOGGER.debug(JSON.stringify(matches, null, 2));
                        LOGGER.verbose(`Number of matches: ${matches.length}`);
                        LOGGER.verbose(`Adjusting subs by ${avgDiff} ms`);
                        return lines.map(l => {
                            return {
                                ...l,
                                startTime: l.startTime + avgDiff,
                                endTime: l.endTime + avgDiff
                            };
                        });
                    }).then((lines: SrtLine[]) => {
                        if (!dryRun) {
                            const outFile = overwrite ? srtFile : `${path.dirname(srtFile)}/${path.basename(srtFile, ".srt")}.${postfix}.srt`;
                            return Srt.writeLinesToStream(lines, fs.createWriteStream(outFile));
                        }
                    });
            });
    }
}
