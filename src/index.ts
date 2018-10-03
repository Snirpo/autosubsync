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

const SUPPORTED_LANGUAGES = {
    "en": "en-US",
    "nl": "nl-NL"
    //TODO: add more
};

export interface AutoSubSyncOptions {
    seekTime?: number
    duration?: number

    matchTreshold?: number
    minWordMatchCount?: number

    overwrite?: boolean
    postfix?: string
    dryRun?: boolean

    language?: string

    speechApiKeyFile?: string
}

export class AutoSubSync {

    static synchronizeAll(videoFile: string,
                          {
                              seekTime = 0,
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
            LOGGER.verbose("Srt files found", srtFiles);

            const options = {
                ...arguments[1],
                language: SUPPORTED_LANGUAGES[language]
            };

            const srtFileForLang = srtFiles.find(srtFile => srtFile.lang === language);
            if (srtFileForLang) {
                LOGGER.verbose(`SRT file found for language ${language}`);
                return AutoSubSync.synchronize(videoFile, srtFileForLang.file, options);
            }

            LOGGER.verbose(`No SRT file found for language ${language}`);
            if (srtFiles.length === 1) {
                LOGGER.verbose(`Found 1 SRT file with unknown language, trying to sync with the english language`);
                return AutoSubSync.synchronize(videoFile, srtFiles[0].file, options);
            }

            return Promise.reject("Found multiple SRT files, please specify which one to sync");
        })
    }

    static synchronize(videoFile: string,
                       srtFile: string,
                       {
                           seekTime = 0,
                           duration = 15000,
                           matchTreshold = 0.80,
                           minWordMatchCount = 4,
                           overwrite = false,
                           postfix = 'synced',
                           dryRun = false,
                           language = "en-US",
                           speechApiKeyFile
                       }: AutoSubSyncOptions = {}) {
        return Srt.readLinesFromStream(fs.createReadStream(srtFile))
            .then(lines => {
                //const seekBytes = seekTime * 32; // 32 bytes for 1 ms
                const fileStream = fs.createReadStream(videoFile);

                const ffMpegStream = FfmpegStream.create();

                const vadStream = VAD.createStream({
                    audioFrequency: audioFrequency,
                    debounceTime: 1000,
                    mode: VAD.Mode.NORMAL
                });

                const matcherStream = MatcherStream.create(lines, {
                    matchTreshold: matchTreshold,
                    minWordMatchCount: minWordMatchCount,
                    seekTime: seekTime
                });

                const recognizerStream = RecognizerStream.create({
                    encoding: 'LINEAR16',
                    sampleRateHertz: audioFrequency,
                    languageCode: language,
                    model: language === "en-US" ? "video" : "default", // video profile is only supported in en-US for now
                    enableWordTimeOffsets: true
                }, speechApiKeyFile);

                const stopStream = new StopStream(fileStream, duration);

                return StreamUtils.toPromise(fileStream, ffMpegStream, vadStream, stopStream, recognizerStream, matcherStream)
                    .then((matches: any[]) => {
                        if (matches.length > 0) {
                            const avgDiff = Math.floor(matches.reduce((total, curr) => {
                                return total + (curr.line.startTime - curr.hyp.startTime);
                            }, 0) / matches.length);
                            const shift = -avgDiff;
                            LOGGER.debug(JSON.stringify(matches, null, 2));
                            LOGGER.verbose(`Number of matches: ${matches.length}`);
                            LOGGER.verbose(`Adjusting subs by ${shift} ms`);
                            return lines.map(l => {
                                return {
                                    ...l,
                                    startTime: l.startTime + shift,
                                    endTime: l.endTime + shift
                                };
                            });
                        }
                        LOGGER.warn("No matches");
                        return null;
                    }).then((lines: SrtLine[]) => {
                        if (!lines) return Promise.resolve();

                        if (!dryRun) {
                            const outFile = overwrite ? srtFile : `${path.dirname(srtFile)}/${path.basename(srtFile, ".srt")}.${postfix}.srt`;
                            return Srt.writeLinesToStream(lines, fs.createWriteStream(outFile));
                        }
                        return Promise.resolve();
                    });
            });
    }
}


