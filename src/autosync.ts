import * as VAD from "node-vad";
import {SrtLine, SrtReader} from "./srt/srt";
import {FFMPEGStream} from "./streams/ffmpeg-stream";
import {RecognizerStream} from "./streams/recognizer-stream";
import {MatcherStream} from "./streams/matcher-stream";
import {StreamUtils} from "./util/stream-utils";

const inFile = process.argv[2];
const srtFile = process.argv[3];

const audioFrequency = 16000.0;
const bitsPerSample = 16; // multiple of 8

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
    .then(data => {
        console.log(JSON.stringify(data, null, 2));
    }, err => {
        console.error(err);
    });

function synchronize(inFile: string, lines: SrtLine[]): Promise<{}> {
    const vad = new VAD(VAD.Mode.MODE_NORMAL);

    return StreamUtils.toPromise(
        FFMPEGStream.create(inFile, {
            bitsPerSample: bitsPerSample,
            audioFrequency: audioFrequency,
            seekTime: seekTime,
            duration: duration
        }),
        vad.createStream({
            audioFrequency: audioFrequency,
            debounceTime: 1000
        }),
        RecognizerStream.create(speechConfig),
        MatcherStream.create({
            lines: lines,
            seekTime: seekTimeMs,
            matchTreshold: matchTreshold
        })
    );
}

