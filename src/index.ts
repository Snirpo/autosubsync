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
import {FFProbe} from "./util/ffprobe";

const audioFrequency = 16000.0;

const SUPPORTED_LANGUAGES = {
    "en": "en-US",
    "nl": "nl-NL"
    //TODO: add more
};

export interface AutoSubSyncOptions {
    runCount?: number,
    seekTime?: number
    seekPercentage?: number
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
                              postfix = 'synced',
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

                        LOGGER.warn(`${videoFile} - No SRT files found`);
                        return Promise.resolve();
                    })
                })).then(() => Promise.resolve());
            }

            LOGGER.verbose(`${videoGlob} - No video files found`);
            return Promise.resolve();
        });
    }

    static synchronize(videoFile: string, srtFile: string, {
        runCount = 1,
        seekPercentage = 0.2
    }: AutoSubSyncOptions = {}) {
        if (runCount < 1) {
            return Promise.reject(`Invalid run count ${runCount}`);
        }
        LOGGER.debug(`Run count ${runCount}`);
        LOGGER.debug(`Seek percentage ${seekPercentage}`);

        return FFProbe.getInfo(videoFile).then(info => {
            LOGGER.debug("Video file info", info);

            const totalDuration = +info.format.duration;
            LOGGER.debug(`Total duration ${totalDuration}`);
            const seekTime = seekPercentage * totalDuration;
            LOGGER.debug(`Seek time ${seekTime}`);
            const chunkTime = (totalDuration - seekTime) / runCount;
            LOGGER.debug(`Chunk time ${chunkTime}`);

            return Promise.all([...Array(runCount).keys()].map(i => {
                const options = {
                    ...arguments[2],
                    seekTime: seekTime + (chunkTime * i)
                };
                return AutoSubSync.actualSynchronize(videoFile, srtFile, options);
            })).then(() => Promise.resolve())
        });

    }

    static actualSynchronize(videoFile: string,
                             srtFile: string,
                             {
                                 seekTime = 0,
                                 duration = 15,
                                 matchTreshold = 0.80,
                                 minWordMatchCount = 4,
                                 overwrite = false,
                                 postfix = 'synced',
                                 dryRun = false,
                                 language = "en-US",
                                 speechApiKeyFile
                             }: AutoSubSyncOptions = {}) {
        LOGGER.verbose(`${videoFile} - Syncing video file with SRT file ${srtFile} with seek time ${seekTime} and duration ${duration}`);

        return Srt.readLinesFromStream(fs.createReadStream(srtFile))
            .then(lines => {
                const ffMpegStream = FfmpegStream.create(videoFile, seekTime);

                const vadStream = VAD.createStream({
                    audioFrequency: audioFrequency,
                    debounceTime: 500,
                    mode: VAD.Mode.NORMAL
                });

                const matcherStream = MatcherStream.create(lines, {
                    matchTreshold: matchTreshold,
                    minWordMatchCount: minWordMatchCount,
                    seekTime: seekTime * 1000
                });

                const recognizerStream = RecognizerStream.create({
                    encoding: 'LINEAR16',
                    sampleRateHertz: audioFrequency,
                    languageCode: language,
                    model: language === "en-US" ? "video" : "default", // video profile is only supported in en-US for now
                    enableWordTimeOffsets: true
                }, speechApiKeyFile);

                const stopStream = new StopStream(ffMpegStream, duration * 1000);

                return StreamUtils.toPromise(ffMpegStream, vadStream, stopStream, recognizerStream, matcherStream)
                    .then((matches: any[]) => {
                        if (matches.length > 0) {
                            LOGGER.debug(JSON.stringify(matches, null, 2));

                            const shift = AutoSubSync.calculateTimeShift(matches);
                            LOGGER.verbose(`${videoFile} - Number of matches: ${matches.length}`);
                            LOGGER.verbose(`${videoFile} - Adjusting subs by ${shift} ms`);

                            return AutoSubSync.shiftLines(lines, shift, videoFile);
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

    private static calculateTimeShift(matches: any[]) {
        const grouped = matches.reduce((map, match) => {
            const hypTime = match.hyp.startTime;
            const lineTime = match.line.startTime;
            (map[match.line.number] = map[match.line.number] || []).push(hypTime - lineTime);
            return map;
        }, {});
        LOGGER.debug("Grouped matches", grouped);
        const groupedValues = Object.keys(grouped).map(key => grouped[key]);

        const singleMatches = groupedValues.filter(m => m.length === 1).map(m => m[0]);
        LOGGER.debug("Single matches", singleMatches);
        const singleMatchAvg = AutoSubSync.calculateAverage(singleMatches);
        LOGGER.debug(`Single match avg: ${singleMatchAvg}`);

        const allMatches = groupedValues.map((matches: number[]) => {
            return matches.reduce((c, m) => {
                const diff = Math.abs(m - singleMatchAvg);
                return diff < c ? m : c;
            })
        });
        LOGGER.debug("All matches", allMatches);
        const allMatchAvg = AutoSubSync.calculateAverage(allMatches);
        LOGGER.debug(`All match avg: ${allMatchAvg}`);
        return allMatchAvg;
    }

    private static calculateAverage(numbers: number[]) {
        return Math.floor(numbers.reduce((total, diff) => total + diff, 0) / numbers.length);
    }

    private static shiftLines(lines: SrtLine[], shift: number, videoFile: string) {
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
}


