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
import {ArrayUtils} from "./util/array-utils";
import {ObjectUtils} from "./util/object-utils";

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
        seekPercentage = 0.2,
        dryRun = false,
        overwrite = false,
        postfix = 'synced',
        duration = 15
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
            const seekTime = Math.floor(seekPercentage * totalDuration);
            LOGGER.debug(`Seek time ${seekTime}`);
            const chunkTime = Math.floor((totalDuration - seekTime) / runCount);
            LOGGER.debug(`Chunk time ${chunkTime}`);

            return Srt.readLinesFromStream(fs.createReadStream(srtFile))
                .then(lines => {
                    return Promise.all([...Array(runCount).keys()].map(i => {
                        const options = {
                            ...arguments[2],
                            seekTime: seekTime + (chunkTime * i)
                        };
                        LOGGER.verbose(`${videoFile} - Syncing video file with SRT file ${srtFile} with seek time ${seekTime} and duration ${duration}`);
                        return AutoSubSync.findMatches(videoFile, lines, options);
                    })).then((matches: any[][]) => {
                        const totalMatches = ArrayUtils.flatten(matches);

                        return AutoSubSync.shiftSubtitles(videoFile, srtFile, lines, totalMatches, arguments[2]);
                    })
                })
        })

    }

    static findMatches(videoFile: string,
                       lines: SrtLine[],
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

        return StreamUtils.toPromise(ffMpegStream, vadStream, stopStream, recognizerStream, matcherStream);
    }

    private static shiftSubtitles(videoFile: string, srtFile: string, lines: SrtLine[], matches: any[], options: AutoSubSyncOptions) {
        if (matches.length > 0) {
            LOGGER.debug(JSON.stringify(matches, null, 2));

            const shift = AutoSubSync.calculateTimeShift(matches);
            LOGGER.verbose(`${videoFile} - Number of matches: ${matches.length}`);
            LOGGER.verbose(`${videoFile} - Adjusting subs by ${shift} ms`);

            const shiftedLines = AutoSubSync.shiftSubtitleLines(lines, shift, videoFile);

            if (!options.dryRun) {
                const outFile = options.overwrite ? srtFile : `${path.dirname(srtFile)}/${path.basename(srtFile, ".srt")}.${options.postfix}.srt`;
                LOGGER.verbose(`${videoFile} - Writing synced SRT to ${outFile}`);
                return Srt.writeLinesToStream(shiftedLines, fs.createWriteStream(outFile));
            }

            return Promise.resolve();
        }
        LOGGER.warn(`${videoFile} - No matches`);
        return Promise.resolve();
    }

    private static calculateTimeShift(matches: any[]) {
        const filteredMatches = AutoSubSync.filterInvalidMatches(matches);
        LOGGER.debug("Filtered matches", filteredMatches.map(match => match.diff));

        const finalMatches = AutoSubSync.filterMultipleMatches(filteredMatches);
        LOGGER.debug("Final matches", finalMatches);

        const finalMatchAvg = ArrayUtils.average(finalMatches);
        LOGGER.debug(`Final match avg: ${finalMatchAvg}`);

        return finalMatchAvg;
    }

    private static filterInvalidMatches(matches: any[]) {
        const sortedMatches = matches.map(match => {
            const diff = match.hyp.startTime - match.line.startTime;
            const weightedDiff = Math.floor(diff * (match.match.percentage * match.match.percentage));
            return {
                ...match,
                diff: weightedDiff
            }
        }).sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
        LOGGER.debug("Sorted matches", sortedMatches.map(match => match.diff));

        let res = [];
        let total = 0;
        let avg = 0;
        for (let i = 0; i < sortedMatches.length; i++) {
            const diff = Math.abs(sortedMatches[i].diff - avg);
            if (diff > 1000) { //TODO: maybe should be configurable
                return res;
            }

            total += sortedMatches[i].diff;
            avg = total / (i + 1);
            res.push(sortedMatches[i]);
        }
        return res;
    }

    private static filterMultipleMatches(matches: any[]) {
        const grouped = ArrayUtils.groupBy(
            matches,
            match => match.line.number,
            match => match.diff
        );
        LOGGER.debug("Grouped matches", grouped);

        const groupedValues = ObjectUtils.values(grouped);

        const singleMatches = groupedValues.filter(m => m.length === 1).map(m => m[0]);
        LOGGER.debug("Single matches", singleMatches);

        const singleMatchAvg = ArrayUtils.average(singleMatches);
        LOGGER.debug(`Single match avg: ${singleMatchAvg}`);

        return groupedValues.map((diffs: any[]) => {
            return ArrayUtils.sortBy(diffs, diff => Math.abs(diff - singleMatchAvg))[0];
        });
    }

    private static shiftSubtitleLines(lines: SrtLine[], shift: number, videoFile: string) {
        return lines.map(line => {
            const startTime = line.startTime + shift;
            const endTime = line.endTime + shift;
            if (startTime < 0 || endTime < 0) {
                throw new Error(`${videoFile} - New time of SRT line smaller than 0`);
            }
            return {
                ...line,
                startTime: startTime,
                endTime: endTime
            };
        });
    }
}


