import {promisify} from "util";
import * as promisifyAll from "util-promisifyall";
import {SrtBlock, SrtReader} from "./srt/srt";

const VAD = require('vad').vad.VAD;
promisifyAll(VAD.prototype);

import * as FFmpeg from 'fluent-ffmpeg';
import {Matcher} from "./matcher/matcher";
import * as fs from "fs";
import * as speech from "@google-cloud/speech";


const speechConfig = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'en-US',
    model: "video"
};

const inFile = process.argv[2];
const srtFile = process.argv[3];

const audioChannels = 1;
const audioFrequency = 16000.0;
const bitsPerSample = 16; // multiple of 8
const timeMultiplier = (1000 / audioFrequency) / ((bitsPerSample / 8) * audioChannels);
const decoderChunkSize = 12800;

const seekTime = 180;
const seekTimeMs = seekTime * 1000;
const duration = 600;
const matchTreshold = 0.75;

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
        const vad = new VAD(VAD.MODE_NORMAL);
        const audioStream = ffmpeg.pipe();
        const speechClient = new speech.SpeechClient();
        //const writeStream = fs.createWriteStream("test.raw");
        let byteCount = 0;

        ffmpeg.on("error", function (err) {
            console.log(err);
            try {
                //decoder.endUtt();
            } catch (err) {
                //ignore
            }
            reject(err);
        });

        let index = 0;
        let average = 0;
        let startTime = 0;
        let inSpeech = false;

        const recognizeStream = speechClient
            .streamingRecognize({
                config: speechConfig,
                interimResults: true
            })
            .on('error', console.error)
            .on('data', data => {
                console.log(
                    `Transcription: ${data.results[0].alternatives[0].transcript}`
                );
            });

        ffmpeg.on('end', function () {
            console.log("end");
            recognizeStream.destroy();
            try {
                //decoder.endUtt();
            } catch (err) {
                //ignore
            }
            resolve(average);
        });

        audioStream.on('data', function (data: Buffer) {

            //writeStream.write(data);
            const floatData = new Buffer(data.length * 2);
            for (let i = 0; i < data.length; i+=2) {
                const intVal = data.readInt16LE(i);
                const floatVal = intVal / 32768.0;
                floatData.writeFloatLE(floatVal, i * 2);
            }

            recognizeStream.write(data);

            // vad.processAudioAsync(floatData, audioFrequency).then(event => {
            //     //console.log(event);
            //     if (event === VAD.EVENT_VOICE) {
            //         //console.log("voice");
            //         recognizeStream.write(data);
            //         //writeStream.write(data);
            //     }
            // })

            //for (let i = 0; i < data.length; i += decoderChunkSize) {
            //     const time = timeMultiplier * byteCount;
            //     //const buffer = data.slice(i, i + decoderChunkSize);
            //     decoder.processRaw(data, false, false);
            //
            //     if (decoder.getInSpeech()) {
            //         if (!inSpeech) {
            //             startTime = time;
            //             inSpeech = true;
            //         }
            //     }
            //     else {
            //         inSpeech = false;
            //         decoder.endUtt();
            //         const hyp = decoder.hyp();
            //
            //         if (hyp) {
            //             //console.log("HYP ---- " + hyp.hypstr);
            //
            //             for (let j = index; j < lines.length; j++) {
            //                 const line = lines[j];
            //                 //const distance = damerauLevenshtein(hyp.hypstr, line.text);
            //                 //const matchPercentage = 1 - (distance / Math.max(hyp.hypstr.length, line.text.length));
            //                 const matchPercentage = Matcher.calculateSentenceMatchPercentage(hyp.hypstr, line.text);
            //                 //console.log(matchPercentage);
            //
            //                 if (matchPercentage > matchTreshold) {
            //                     index = j;
            //                     const timeDiff = Math.abs(line.startTime - (seekTimeMs + startTime));
            //                     average = average === 0 ? timeDiff : (average + timeDiff) / 2;
            //                     console.log("Match: " + line.text + " " + hyp.hypstr + " timeDiff: " + timeDiff + " percentage: " + matchPercentage);
            //                     break;
            //                 }
            //             }
            //         }
            //
            //         decoder.startUtt();
            //     }
            //     //console.log(buffer.length);
            //     byteCount += data.length;
            //}
        });
    });
}









