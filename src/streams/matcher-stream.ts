import {Transform} from "stream";
import {SrtLine} from "../srt/srt";
import * as damerauLevenshtein from 'talisman/metrics/distance/damerau-levenshtein';
import * as _ from "lodash";

export interface MatcherStreamConfig {
    minWordMatchCount: number,
    matchTreshold: number,
    seekTime: number
}

interface MatchResult {
    percentage: number,
    words?: string[],
    startIndex?: number,
    endIndex?: number
}

export class MatcherStream extends Transform {

    constructor(private lines: SrtLine[], private config: MatcherStreamConfig) {
        super({
            objectMode: true
        });
    }

    _transform(data: any, encoding, callback) {
        data.speech.results.forEach(result => {
            const alternative = result.alternatives[0]; // Always first
            const transcript = alternative.transcript;

            this.lines.forEach((line, index) => {
                const lineWords = _.words(line.text);

                const bestMatch = this.calculateSentenceMatchPercentage(alternative.words.map(w => w.word), lineWords);

                if (bestMatch && bestMatch.percentage > this.config.matchTreshold) {
                    const startTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[bestMatch.startIndex].startTime);
                    const endTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[bestMatch.endIndex].endTime);

                    this.push({
                        index: index,
                        line: line,
                        hyp: {
                            transcript: transcript,
                            startTime: this.config.seekTime + startTime,
                            endTime: this.config.seekTime + endTime
                        },
                        match: bestMatch
                    });
                }
            });
        });

        return callback();
    }

    private calculateSentenceMatchPercentage(hypWords: string[], subWords: string[]): MatchResult {
        if (subWords.length < this.config.minWordMatchCount) {
            return null;
        }

        let bestMatch: MatchResult = {
            percentage: 0.0
        };

        const subStr = subWords.join(' ');

        for (let i = 0; i < hypWords.length - subWords.length; i++) {
            const matchingWords = hypWords.slice(i, i + subWords.length);
            const matchingStr = matchingWords.join(' ');
            const distance = damerauLevenshtein(matchingStr, subStr);
            const percentage = 1 - (distance / subStr.length);

            if (percentage > bestMatch.percentage) {
                bestMatch = {
                    percentage: percentage,
                    words: matchingWords,
                    startIndex: i,
                    endIndex: i + subWords.length - 1
                }
            }

            if (percentage === 1.0) {
                return bestMatch;
            }
        }

        return bestMatch;
    }

    private static toMillis(time) {
        return (time.seconds * 1000) + (time.nanos / 1000000);
    }

    static create(lines: SrtLine[], config: MatcherStreamConfig) {
        return new MatcherStream(lines, config);
    }
}