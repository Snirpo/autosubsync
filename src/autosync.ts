import {SrtLine, SrtReader} from "./srt/srt";

import * as VAD from "node-vad";
import * as FFmpeg from 'fluent-ffmpeg';
import * as speech from "@google-cloud/speech";
import {PassThrough, Transform} from "stream";
import {Matcher} from "./matcher/matcher";
import {FlatMapStream, StreamConfig} from "./mappingstream/flatmapstream";

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

function createFFmpeg(inFile: string) {
    return FFmpeg(inFile)
        .seekInput(seekTime)
        .duration(duration)
        .withAudioChannels(audioChannels)
        .withAudioFrequency(audioFrequency)
        .toFormat('s' + bitsPerSample.toString() + 'le');
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
        const ffmpeg = createFFmpeg(inFile);

        ffmpeg.pipe()
            .pipe(createTimestamper(seekTimeMs))
            //.pipe(simpleRecognize(speechConfig))
            .pipe(createSpeechFilter())
            .pipe(createRecognizer(speechConfig))
            //.pipe(createMatcher(lines, seekTimeMs, matchTreshold))
            .on("error", console.log)
            .on("data", data => {
                data.audioData = null;
                //console.log(JSON.stringify(data, null, 2));
                //console.log(data);
            });
    });
}

// function simpleRecognize(speechConfig) {
//     const speechClient = new speech.SpeechClient();
//     return new SpeechStream(speechClient.streamingRecognize({config: speechConfig}));
// }
//
// class SpeechStream extends MappingStream {
//     constructor(stream: Duplex) {
//         super(stream, {objectMode: true});
//     }
//
//     _mapRead(data) {
//         return data;
//     }
//
//     _mapWrite(data) {
//         return data.audioData;
//     }
//
// }

function createTimestamper(seekTime: number) {
    let byteCount = 0;
    return new Transform({
        writableObjectMode: false,
        readableObjectMode: true,
        transform: (chunk, encoding, callback) => {
            const time = seekTime + (timeMultiplier * byteCount);
            byteCount += chunk.length;
            callback(null, <Data>{time: time, audioData: chunk});
        }
    });
}

function createSpeechFilter() {
    const vad = new VAD(VAD.Mode.MODE_NORMAL);
    let inSpeech = false;
    let startTime = 0;
    let lastSpeech = 0;

    return new Transform({
        objectMode: true,
        transform: (chunk: any, encoding, callback) => {
            vad.processAudio(chunk.audioData, audioFrequency, (err, event) => {
                if (event === VAD.Event.EVENT_ERROR) {
                    return callback("Error in VAD");
                }

                let start = false;

                if (inSpeech && (chunk.time - lastSpeech > 60000)) {
                    inSpeech = false;
                }

                if (event === VAD.Event.EVENT_VOICE) {
                    // Speech
                    if (!inSpeech) {
                        inSpeech = true;
                        startTime = chunk.time;
                        start = true;
                    }

                    lastSpeech = chunk.time;
                }

                if (inSpeech) {
                    return callback(null, <Data>{
                        time: chunk.time,
                        audioData: chunk.audioData,
                        start: start,
                        startTime: startTime
                    });
                }

                //if ((chunk.time - lastSpeech > 1000))
                console.log("NO SPEECH FOR: " + (chunk.time - lastSpeech));
                return callback();
            });
        }
    });
}

function createRecognizer(speechConfig) {
    const speechClient = new speech.SpeechClient();
    let currentStream: StreamConfig = null;

    return FlatMapStream.obj(data => {
        if (data.start) {
            const startTime = data.startTime;
            currentStream = <StreamConfig>{
                //stream: speechClient.streamingRecognize({config: speechConfig}),
                stream: new PassThrough(),
                readMapper: data => <any>{
                    startTime: startTime,
                    speech: data
                },
                writeMapper: data => {
                    //console.log("write audio" + data.audioData.length);
                    return data.audioData;
                }
            }
        }
        return currentStream;
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