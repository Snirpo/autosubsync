import {Matcher} from "../matcher/matcher";
import {Transform} from "stream";
import {SrtLine} from "../srt/srt";

export class MatcherStream {
    static create(config: {
        lines: SrtLine[],
        seekTime: number,
        matchTreshold: number
    }): Transform {
        return new Transform({
            objectMode: true,
            transform: (data: any, _, done) => {
                const matches = data.speech.results.reduce((matches, result) => {
                    const alternative = result.alternatives[0]; // Always first
                    const transcript = alternative.transcript;

                    config.lines.forEach((line, index) => {
                        const matchPercentage = Matcher.calculateSentenceMatchPercentage(transcript, line.text);

                        if (matchPercentage > config.matchTreshold) {
                            const startTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[0].startTime);
                            const endTime = data.speech.startTime + MatcherStream.toMillis(alternative.words[alternative.words.length - 1].endTime);

                            matches.push({
                                index: index,
                                line: line,
                                hyp: {
                                    transcript: transcript,
                                    startTime: config.seekTime + startTime,
                                    endTime: config.seekTime + endTime
                                },
                                matchPercentage: matchPercentage
                            });
                        }
                    });
                    return matches;
                }, []);

                //console.log(JSON.stringify(matches, null, 2));
                if (matches.length === 1) {
                    return done(null, matches[0]);
                }
                return done();
            }
        })
    }

    static toMillis(time) {
        return (time.seconds * 1000) + (time.nanos / 1000000);
    }
}