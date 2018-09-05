import {SrtLine, SrtReader} from "./srt/srt";

import * as VAD from "node-vad";


import {Transform} from "stream";
import {Matcher} from "./matcher/matcher";
import {FlatMapStream, StreamConfig} from "./streams/flatmapstream";
import {FFMPEGStream} from "./streams/ffmpeg-stream";
import {RecognizerStream} from "./streams/recognizer-stream";

const inFile = process.argv[2];
const srtFile = process.argv[3];

const audioChannels = 1;
const audioFrequency = 16000.0;
const bitsPerSample = 16; // multiple of 8
const timeMultiplier = (1000 / audioFrequency) / ((bitsPerSample / 8) * audioChannels);

const speechConfig = {
    encoding: 'LINEAR16',
    sampleRateHertz: audioFrequency,
    languageCode: 'en-US',
    model: "video",
    enableWordTimeOffsets: true
};

const seekTime = 600; // 10 minutes
const seekTimeMs = seekTime * 1000;
const duration = 60;
const matchTreshold = 0.60;

interface Data {
    audioData: Buffer,
    inSpeech?: boolean,
    time?: number,
    speech?: any,
    startTime: number
}

SrtReader.readLines(srtFile)
    .then(lines => synchronize(inFile, lines))
    .then(line => {
        console.log(line);
    }, err => {
        console.error(err);
    });

function synchronize(inFile: string, lines: SrtLine[]): Promise<{}> {
    return new Promise((resolve, reject) => {
        const vad = new VAD(VAD.Mode.MODE_NORMAL);

        FFMPEGStream.create(inFile, {
            bitsPerSample: 16,
            audioFrequency: audioFrequency,
            seekTime: seekTime,
            duration: duration
        })
            .pipe(vad.createStream({
                audioFrequency: audioFrequency,
                debounceTime: 1000
            }))
            .pipe(RecognizerStream.create(speechConfig))

        // //.pipe(simpleRecognize(speechConfig))
        //     .pipe(createSpeechFilter())
        //     .pipe(createRecognizer(speechConfig))
        //     //.pipe(createMatcher(lines, seekTimeMs, matchTreshold))
        //     .on("error", console.log)
        //     .on("data", data => {
        //         data.audioData = null;
        //         console.log(JSON.stringify(data, null, 2));
        //         //console.log(data);
        //     });
    });
}

function createMatcher(lines: SrtLine[], seekTime: number, matchTreshold: number): Transform {
    return new Transform({
        objectMode: true,
        transform: (data: any, _, done) => {
            const matches = data.results.reduce((matches, result) => {
                const alternative = result.alternatives[0]; // Always first and only for now
                const transcript = alternative.transcript;

                lines.forEach((line, index) => {
                    const matchPercentage = Matcher.calculateSentenceMatchPercentage(transcript, line.text);

                    if (matchPercentage > matchTreshold) {
                        const startTime = toMillis(alternative.words[0].startTime);
                        const endTime = toMillis(alternative.words[alternative.words.length - 1].endTime);

                        matches.push({
                            index: index,
                            line: line,
                            hyp: {
                                transcript: transcript,
                                startTime: seekTime + startTime,
                                endTime: seekTime + endTime
                            },
                            matchPercentage: matchPercentage
                        });
                    }
                });
                //return {index: index, line: line, matchPercentage: matchPercentage};
                return matches;
            }, []);

            //console.log(JSON.stringify(matches, null, 2));
            if (matches.length === 1) {
                done(null, matches[0]);
            }
            else {
                done();
            }
        }
    })
}

function toMillis(time) {
    return (time.seconds * 1000) + (time.nanos / 1000000);
}