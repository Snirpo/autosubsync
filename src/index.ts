import * as VAD from "node-vad";
import {Srt, SrtLine} from "./srt/srt";
import {RecognizerStream} from "./streams/recognizer-stream";
import {MatcherStream} from "./streams/matcher-stream";
import {StreamUtils} from "./util/stream-utils";
import * as fs from "fs";
import * as path from "path";
import {LOGGER} from "./logger/logger";
import * as glob from "fast-glob";
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

    static synchronizeAll(videoGlob: string,
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

        return glob(videoGlob).then((videoFiles: string[]) => {
            if (videoFiles.length > 0) {
                LOGGER.verbose(`${videoGlob} - Video files found`, videoFiles);

                return Promise.all(videoFiles.map(videoFile => {
                    const basename = `${path.dirname(videoFile)}/${path.basename(videoFile, path.extname(videoFile))}`;
                    return glob(`${basename}*.srt`).then((arr: string[]) => {
                        const srtFiles = arr.map(srtFile => <any>{
                            file: srtFile,
                            lang: path.basename(srtFile, ".srt").split(".").pop()
                        }).filter(srtFile => !(srtFile.lang === "synced" || srtFile.lang === postfix));

                        if (srtFiles.length > 0) {
                            LOGGER.verbose(`${videoFile} - SRT files found`, srtFiles);

                            const options = {
                                ...arguments[1],
                                language: SUPPORTED_LANGUAGES[language]
                            };

                            const srtFileForLang = srtFiles.find(srtFile => srtFile.lang === language);
                            if (srtFileForLang) {
                                LOGGER.verbose(`${videoFile} - SRT file found for language ${language}`);
                                return AutoSubSync.synchronize(videoFile, srtFileForLang.file, options);
                            }

                            LOGGER.verbose(`${videoFile} - No SRT file found for language ${language}`);
                            const srtFileWithoutLangName = `${basename}.srt`;
                            const srtFileWithoutLang = srtFiles.find(srtFile => srtFile.file === srtFileWithoutLangName);
                            if (srtFileWithoutLang) {
                                LOGGER.verbose(`${videoFile} - Found 1 SRT file with same name as video file, trying to sync with the english language`);
                                return AutoSubSync.synchronize(videoFile, srtFileWithoutLang.file, options);
                            }

                            LOGGER.warn(`${videoFile} - No matching SRT file found`);
                            return Promise.resolve();
                        }

                        LOGGER.verbose(`${videoFile} - No SRT files found`);
                        return Promise.resolve();
                    })
                })).then(() => Promise.resolve());
            }

            LOGGER.verbose(`${videoGlob} - No video files found`);
            return Promise.resolve();
        });
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
        LOGGER.verbose(`${videoFile} - Syncing video file with SRT file ${srtFile}`);

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
                            LOGGER.verbose(`${videoFile} - Number of matches: ${matches.length}`);
                            LOGGER.verbose(`${videoFile} - Adjusting subs by ${shift} ms`);

                            return lines.map(l => {
                                const startTime = l.startTime + shift;
                                const endTime = l.endTime + shift;
                                if (startTime < 0 || endTime < 0) {
                                    throw new Error(`${videoFile} - New time of SRT line smaller than 0`);
                                }
                                return {
                                    ...l,
                                    startTime: l.startTime + shift,
                                    endTime: l.endTime + shift
                                };
                            });
                        }
                        LOGGER.warn(`${videoFile} - No matches`);
                        return null;
                    }).then((lines: SrtLine[]) => {
                        if (!lines) return Promise.resolve();

                        if (!dryRun) {
                            const outFile = overwrite ? srtFile : `${path.dirname(srtFile)}/${path.basename(srtFile, ".srt")}.${postfix}.srt`;
                            LOGGER.verbose(`${videoFile} - Writing synced SRT to ${outFile}`);
                            return Srt.writeLinesToStream(lines, fs.createWriteStream(outFile));
                        }

                        return Promise.resolve();
                    });
            });
    }
}


