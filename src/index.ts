import * as VAD from "node-vad";
import {Srt, SrtLine} from "./srt/srt";
import {RecognizerStream} from "./streams/recognizer-stream";
import {MatcherStream} from "./streams/matcher-stream";
import {StreamUtils} from "./util/stream-utils";
import * as fs from "fs";
import * as path from "path";
import {LOGGER} from "./logger/logger";
import * as globby from "globby";
import {FfmpegStream} from "./streams/ffmpeg-stream";
import {StopStream} from "./util/stop-stream";

const audioFrequency = 16000.0;
const bitsPerSample = 16; // multiple of 8

const SUPPORTED_LANGUAGES = {
    "en": "en-US",
    "nl": "nl-NL"
    //TODO: add more
};

const FFMPEG_ARGS = [
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "s16le"
];

export interface AutoSubSyncOptions {
    duration?: number,

    matchTreshold?: number,
    minWordMatchCount?: number,

    overwrite?: boolean,
    postfix?: string,
    dryRun?: boolean,

    language?: string
}

export class AutoSubSync {

    static synchronizeAll(videoFile: string,
                          {
                              duration = 15000,
                              matchTreshold = 0.80,
                              minWordMatchCount = 4,
                              overwrite = false,
                              postfix = 'synced',
                              dryRun = false,
                              language = "en"
                          }: AutoSubSyncOptions = {}) {
        if (!SUPPORTED_LANGUAGES[language]) {
            return Promise.reject(`Language ${language} not supported`);
        }

        return globby(`${path.dirname(videoFile)}/${path.basename(videoFile, path.extname(videoFile))}*.srt`).then((arr: string[]) => {
            const srtFiles = arr.map(srtFile => <any>{
                file: srtFile,
                lang: path.basename(srtFile, ".srt").split(".").pop()
            }).filter(srtFile => !(srtFile.lang === "synced" || srtFile.lang === postfix));
            LOGGER.verbose(`Srt files found`, srtFiles);

            const options = {
                ...arguments[1],
                language: SUPPORTED_LANGUAGES[language]
            };

            const srtFileForLang = srtFiles.find(srtFile => srtFile.lang === language);
            if (srtFileForLang) {
                return AutoSubSync.synchronize(videoFile, srtFileForLang.file, options);
            }

            LOGGER.verbose(`No SRT file found for language ${language}, falling back to syncing all SRT files`);
            return Promise.all(srtFiles.map(srtFile => AutoSubSync.synchronize(videoFile, srtFile.file, options)));
        })
    }

    static synchronize(videoFile: string,
                       srtFile: string,
                       {
                           duration = 15000,
                           matchTreshold = 0.80,
                           minWordMatchCount = 4,
                           overwrite = false,
                           postfix = 'synced',
                           dryRun = false,
                           language = "en-US"
                       }: AutoSubSyncOptions = {}) {
        return Srt.readLinesFromStream(fs.createReadStream(srtFile))
            .then(lines => {
                const fileStream = fs.createReadStream(videoFile);

                const ffMpegStream = FfmpegStream.create(FFMPEG_ARGS);

                const vadStream = VAD.createStream({
                    audioFrequency: audioFrequency,
                    debounceTime: 1000,
                    mode: VAD.Mode.NORMAL
                });

                const matcherStream = MatcherStream.create(lines, {
                    seekTime: 0,
                    //seekTime: 600 * 1000,
                    matchTreshold: matchTreshold,
                    minWordMatchCount: minWordMatchCount
                });

                const recognizerStream = RecognizerStream.create({
                    encoding: 'LINEAR16',
                    sampleRateHertz: audioFrequency,
                    languageCode: language,
                    model: language === "en-US" ? "video" : "default", // video profile is only supported in en-US for now
                    //model: "default",
                    enableWordTimeOffsets: true
                });

                const stopStream = new StopStream(fileStream, duration);

                return StreamUtils.toPromise(fileStream, ffMpegStream, vadStream, stopStream, recognizerStream, matcherStream)
                    .then((matches: any[]) => {
                        if (matches.length > 0) {
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
                        }
                        LOGGER.warn('No matches');
                        return null;
                    }).then((lines: SrtLine[]) => {
                        if (!lines) return Promise.resolve();

                        if (!dryRun) {
                            const outFile = overwrite ? srtFile : `${path.dirname(srtFile)}/${path.basename(srtFile, ".srt")}.${postfix}.srt`;
                            return Srt.writeLinesToStream(lines, fs.createWriteStream(outFile));
                        }
                    });
            });
    }
}


