import {SrtLine, SrtReader} from "./srt/srt";

import * as VAD from "node-vad";


import {Transform} from "stream";
import {Matcher} from "./matcher/matcher";
import {FFMPEGStream} from "./streams/ffmpeg-stream";
import {RecognizerStream} from "./streams/recognizer-stream";
import {MatcherStream} from "./streams/matcher-stream";

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
            .pipe(MatcherStream.create({
                lines: lines,
                seekTime: seekTimeMs,
                matchTreshold: matchTreshold
            }))
            .on("error", console.log)
            .on("data", data => {
                data.audioData = null;
                console.log(JSON.stringify(data, null, 2));
                //console.log(data);
            });
    });
}

