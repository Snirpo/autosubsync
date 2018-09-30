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
    matches?: MatchInfo[]
}

interface MatchInfo {
    words: string[],
    startIndex: number,
    endIndex: number
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

                if (bestMatch.percentage > this.config.matchTreshold) {
                    const startTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[bestMatch.matches[0].startIndex].startTime);
                    const endTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[bestMatch.matches[0].endIndex].endTime);

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

    private calculateSentenceMatchPercentage(words1: string[], words2: string[]): MatchResult {
        let bestMatch: MatchResult = {
            percentage: 0.0
        };

        let longestWords: string[];
        let shortestWords: string[];

        if (words1.length >= words2.length) {
            longestWords = words1;
            shortestWords = words2;
        }
        else {
            longestWords = words2;
            shortestWords = words1;
        }

        const shortestStr = shortestWords.join(' ');
        const shortest: MatchInfo = {
            words: shortestWords,
            startIndex: 0,
            endIndex: shortestWords.length - 1
        };

        for (let i = 0; i < longestWords.length; i++) {
            for (let j = i + this.config.minWordMatchCount; j <= Math.min(i + shortestWords.length, longestWords.length); j++) {
                const matchingWords = longestWords.slice(i, j);
                const matchingStr = matchingWords.join(' ');
                const distance = damerauLevenshtein(matchingStr, shortestStr);
                const percentage = 1 - (distance / Math.max(matchingStr.length, shortestStr.length));

                if (percentage > bestMatch.percentage) {
                    const match: MatchInfo = {
                        words: matchingWords,
                        startIndex: i,
                        endIndex: j - 1
                    };
                    bestMatch = {
                        percentage: percentage,
                        matches: words1.length > words2.length ?
                            [match, shortest] :
                            [shortest, match]
                    }
                }

                if (percentage === 1.0) {
                    return bestMatch;
                }
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