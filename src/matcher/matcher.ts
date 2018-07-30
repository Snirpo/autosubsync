import * as _ from "lodash";
import * as damerauLevenshtein from 'talisman/metrics/distance/damerau-levenshtein';

const minWordCount = 4;
const maxWordShift = 2;

export class Matcher {
    static calculateSentenceMatchPercentage(str1: string, str2: string): number {
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

        for (let i = 0; i < Math.min(longestWords.length, maxWordShift + 1); i++) {
            for (let j = i + minWordCount; j <= Math.min(i + shortestWords.length, longestWords.length); j++) {
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
}