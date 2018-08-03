import * as stream from "highland";

import {SrtBlock, SrtReader} from "./srt/srt";

import * as VAD from "node-vad";
VAD.prototype.processAudioStream = stream.wrapCallback(VAD.prototype.processAudio);


import * as FFmpeg from 'fluent-ffmpeg';
import {Matcher} from "./matcher/matcher";
import * as fs from "fs";
import * as speech from "@google-cloud/speech";
import {Transform} from "stream";
import {start} from "repl";

const inFile = process.argv[2];
const srtFile = process.argv[3];

const audioChannels = 1;
const audioFrequency = 16000.0;
const bitsPerSample = 16; // multiple of 8
const timeMultiplier = (1000 / audioFrequency) / ((bitsPerSample / 8) * audioChannels);
const decoderChunkSize = 12800;

const speechConfig = {
    encoding: 'LINEAR16',
    sampleRateHertz: audioFrequency,
    languageCode: 'en-US',
    model: "video"
};

const seekTime = 600; // 10 minutes
const seekTimeMs = seekTime * 1000;
const duration = 30;
const matchTreshold = 0.80;

function getFFmpeg(inFile: string) {
    return FFmpeg(inFile)
        .seekInput(seekTime)
        .duration(duration)
        .withAudioChannels(audioChannels)
        .withAudioFrequency(audioFrequency)
        .toFormat('s' + bitsPerSample.toString() + 'le');
}

SrtReader.readBlocks(srtFile)
    .then(blocks => {
        //blocks.forEach(b => console.log("block: " + b.text));
        return blocks;
    })
    .then(lines => synchronize(inFile, lines))
    .then(line => {
        console.log(line);
    }, err => {
        console.error(err);
    });

function synchronize(inFile: string, lines: SrtBlock[]): Promise<{}> {
    return new Promise((resolve, reject) => {
        const ffmpeg = getFFmpeg(inFile);

        const audioStream = ffmpeg.pipe();
        const speechClient = new speech.SpeechClient();
        //const writeStream = fs.createWriteStream("test.raw");

        // const recognizeStream = speechClient
        //     .streamingRecognize({
        //         config: speechConfig,
        //         //interimResults: true
        //     });

        stream(audioStream)
            .map(createTimer())
            .flatMap(createSpeechFilter())
            // .pipe(recognizeStream)
            // .pipe(createMatcher(lines))
            // .on('error', console.error)
            .each(data => {
                console.log(data);
            });
    });
}

function createTimer() {
    let byteCount = 0;
    return (data: Buffer) => {
        const time = timeMultiplier * byteCount;
        byteCount += data.length;
        return {time: time, byteCount: byteCount, data: data};
    }
}

// function createMatcher(lines: SrtBlock[]): Transform {
//     let index = 0;
//     let average = 0;
//
//     return new Transform({
//         objectMode: true,
//         transform: (data: any, _, done) => {
//             const hyp = data.results[0].alternatives[0].transcript;
//             //console.log(hyp);
//
//             for (let j = index; j < lines.length; j++) {
//                 const line = lines[j];
//                 //const distance = damerauLevenshtein(hyp.hypstr, line.text);
//                 //const matchPercentage = 1 - (distance / Math.max(hyp.hypstr.length, line.text.length));
//                 const matchPercentage = Matcher.calculateSentenceMatchPercentage(hyp, line.text);
//                 //console.log(matchPercentage);
//
//                 if (matchPercentage > matchTreshold) {
//                     index = j;
//                     const timeDiff = Math.abs(line.startTime - (seekTimeMs + context.startTime));
//                     average = average === 0 ? timeDiff : (average + timeDiff) / 2;
//                     done(null, "----Match:" + line.text + "\n----Hyp:" + hyp + "\n----timeDiff: " + timeDiff + "\n ----percentage: " + matchPercentage);
//                     return;
//                 }
//             }
//             done(null, "No match found");
//         }
//     })
// }

function createSpeechFilter() {
    const vad = new VAD(VAD.Mode.MODE_NORMAL);
    let inSpeech = false;
    let startTime = 0;

    return (obj: { time, data }) => {
        const floatData = new Buffer(obj.data.length * 2);
        for (let i = 0; i < obj.data.length; i += 2) {
            const intVal = obj.data.readInt16LE(i);
            const floatVal = intVal / 32768.0;
            floatData.writeFloatLE(floatVal, i * 2);
        }

        return vad.processAudioStream(floatData, audioFrequency).map(event => {
            //console.log(event);
            if (event === VAD.EVENT_VOICE) {
                if (!inSpeech) {
                    startTime = obj.time;
                    inSpeech = true;
                }
            }
            else {
                inSpeech = false;
                startTime = 0;
            }
            return {inSpeech: inSpeech, startTime: startTime, time: obj.time, data: obj.data};
        });


    }
}









