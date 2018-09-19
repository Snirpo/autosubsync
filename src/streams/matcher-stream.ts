import {Transform} from "stream";
import {SrtLine} from "../srt/srt";
import * as _ from "lodash";
import * as damerauLevenshtein from 'talisman/metrics/distance/damerau-levenshtein';

export interface MatcherStreamConfig {
    minWordMatchCount: number,
    maxWordShift: number,
    matchTreshold: number,
    seekTime: number
}

export class MatcherStream extends Transform {

    constructor(private lines: SrtLine[], private config: MatcherStreamConfig) {
        super({
            objectMode: true
        });
    }

    _transform(data: any, _, done) {
        data.speech.results.forEach(result => {
            const alternative = result.alternatives[0]; // Always first
            const transcript = alternative.transcript;

            this.lines.forEach((line, index) => {
                const matchPercentage = this.calculateSentenceMatchPercentage(transcript, line.text);

                if (matchPercentage > this.config.matchTreshold) {
                    const startTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[0].startTime);
                    const endTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[alternative.words.length - 1].endTime);

                    this.push({
                        index: index,
                        line: line,
                        hyp: {
                            transcript: transcript,
                            startTime: this.config.seekTime + startTime,
                            endTime: this.config.seekTime + endTime
                        },
                        matchPercentage: matchPercentage
                    });
                }
            });
        });

        return done();
    }

    calculateSentenceMatchPercentage(str1: string, str2: string): number {
        let bestPercentage = 0.0;

        const str1Words = _.words(str1);
        const str2Words = _.words(str2);

        let longestWords: string[];
        let shortestWords: string[];

        if (str1Words.length > str2Words.length) {
            longestWords = str1Words;
            shortestWords = str2Words;
        }
        else {
            longestWords = str2Words;
            shortestWords = str1Words;
        }

        const shortestStr = shortestWords.join(' ');

        const maxWordShift = this.config.maxWordShift === -1 ? longestWords.length : this.config.maxWordShift;

        for (let i = 0; i < Math.min(longestWords.length, maxWordShift + 1); i++) {
            for (let j = i + this.config.minWordMatchCount; j <= Math.min(i + shortestWords.length, longestWords.length); j++) {
                const longestStr = longestWords.slice(i, j).join(' ');
                const distance = damerauLevenshtein(longestStr, shortestStr);
                const percentage = 1 - (distance / Math.max(longestStr.length, shortestStr.length));

                if (percentage === 1.0) {
                    return 1.0;
                }

                if (percentage > bestPercentage) {
                    bestPercentage = percentage;
                }
            }
        }

        return bestPercentage;
    }

    static toMillis(time) {
        return (time.seconds * 1000) + (time.nanos / 1000000);
    }

    static create(lines: SrtLine[], config: MatcherStreamConfig) {
        return new MatcherStream(lines, config);
    }
}