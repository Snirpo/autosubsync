import {SrtBlock, SrtReader} from "./srt/srt";

const VAD = require('vad').vad.VAD;
import * as FFmpeg from 'fluent-ffmpeg';
import {Matcher} from "./matcher/matcher";
import * as fs from "fs";

const inFile = process.argv[2];
const srtFile = process.argv[3];

const audioChannels = 1;
const audioFrequency = 16000.0;
const bitsPerSample = 32; // multiple of 8
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
        .toFormat('f' + bitsPerSample.toString() + 'le');
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
        const readableStream = ffmpeg.pipe();
        const writeStream = fs.createWriteStream("test.raw");
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

        ffmpeg.on('end', function () {
            console.log("end");
            try {
                //decoder.endUtt();
            } catch (err) {
                //ignore
            }
            resolve(average);
        });

        let index = 0;
        let average = 0;
        let startTime = 0;
        let inSpeech = false;

        readableStream.on('data', function (data) {

            //writeStream.write(data);
            vad.processAudio(data, audioFrequency, function(error, event) {
                console.log(event);
                if (event === VAD.EVENT_VOICE) {
                   writeStream.write(data);
                }
            })

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









