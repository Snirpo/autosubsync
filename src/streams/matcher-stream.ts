import {Transform} from "stream";
import {SrtLine} from "../srt/srt";
import * as damerauLevenshtein from 'talisman/metrics/distance/damerau-levenshtein';

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
        const speechResults: any[] = data.speech.results;
        speechResults.forEach(result => {
            const alternative = result.alternatives[0]; // Always first
            const transcript = alternative.transcript;
            const hypWords = alternative.words.map(w => w.word.toLowerCase());

            this.lines.filter(line => line.words.length >= this.config.minWordMatchCount).forEach(line => {
                const bestMatch = MatcherStream.calculateBestMatch(hypWords, line.words);

                if (bestMatch && bestMatch.percentage > this.config.matchTreshold) {
                    const startTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[bestMatch.startIndex].endTime);
                    const endTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[bestMatch.endIndex].endTime);

                    this.push({
                        line: line,
                        hyp: {
                            transcript: transcript,
                            startTime: this.config.seekTime + startTime,
                            endTime: this.config.seekTime + endTime
                        },
                        speech: data.speech,
                        match: bestMatch
                    });
                }
            });
        });

        return callback();
    }

    private static calculateBestMatch(hypWords: string[], subWords: string[]): MatchResult {
        let bestMatch: MatchResult = {
            percentage: 0.0
        };

        const subStr = subWords.join(' ');

        for (let i = 0; i < hypWords.length - subWords.length + 1; i++) {
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