import * as Stream from "highland";

import {SrtBlock, SrtReader} from "./srt/srt";

import * as VAD from "node-vad";
import * as FFmpeg from 'fluent-ffmpeg';
import * as speech from "@google-cloud/speech";
import {Transform} from "stream";
import {MappingStream} from "./mappingstream/mappingstream";
import {Matcher} from "./matcher/matcher";

VAD.prototype.processAudioStream = Stream.wrapCallback(VAD.prototype.processAudio);

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
    model: "video",
    enableWordTimeOffsets: true
};

const seekTime = 600; // 10 minutes
const seekTimeMs = seekTime * 1000;
const duration = 15;
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
        //const writeStream = fs.createWriteStream("test.raw");

        audioStream
        //.through(recognizeStream)
            .pipe(createTimestamper(seekTimeMs))
            //.pipe(createSpeechFilter())
            .pipe(createRecognizer())
            //.pipe(createMatcher(lines))
            .on("error", console.log)
            .on("data", data => {
                data.data = null;
                console.log(JSON.stringify(data));
                //console.log(data);
            });
    });
}

function createTimestamper(seekTime: number) {
    let byteCount = 0;
    return new Transform({
        objectMode: true,
        transform: (chunk, encoding, callback) => {
            const time = seekTime + (timeMultiplier * byteCount);
            byteCount += chunk.length;
            callback(null, {time: time, byteCount: byteCount, data: chunk});
        }
    });
}

function createRecognizer() {
    const speechClient = new speech.SpeechClient();

    return MappingStream.ofDuplex(speechClient.streamingRecognize({
        config: speechConfig,
        //interimResults: true
    }));
}

function createMatcher(lines: SrtBlock[]): Transform {
    let index = 0;
    let average = 0;

    return new Transform({
        objectMode: true,
        transform: (data: any, _, done) => {
            const hyp = data.speech.results[0].alternatives[0].transcript;
            //console.log(hyp);

            for (let j = index; j < lines.length; j++) {
                const line = lines[j];
                //const distance = damerauLevenshtein(hyp.hypstr, line.text);
                //const matchPercentage = 1 - (distance / Math.max(hyp.hypstr.length, line.text.length));
                const matchPercentage = Matcher.calculateSentenceMatchPercentage(hyp, line.text);
                //console.log(matchPercentage);

                if (matchPercentage > matchTreshold) {
                    index = j;
                    const timeDiff = Math.abs(line.startTime - data.startTime);
                    average = average === 0 ? timeDiff : (average + timeDiff) / 2;
                    done(null, "----Match:" + line.text + "\n----Hyp:" + hyp + "\n----timeDiff: " + timeDiff + "\n ----percentage: " + matchPercentage);
                    return;
                }
            }
            done(null, "No match found for: " + hyp);
        }
    })
}

function createSpeechFilter() {
    const vad = new VAD(VAD.Mode.MODE_NORMAL);
    let inSpeech = false;
    let startTime = 0;

    return new Transform({
        objectMode: true,
        transform: (chunk: any, encoding, callback) => {
            vad.processAudio(chunk.data, audioFrequency, (err, event) => {
                if (event === VAD.Event.EVENT_ERROR) {
                    callback("Error in VAD");
                }

                if (event === VAD.Event.EVENT_VOICE) {
                    if (!inSpeech) {
                        startTime = chunk.time;
                        inSpeech = true;
                    }
                }
                else {
                    inSpeech = false;
                    startTime = 0;
                }

                if (inSpeech) {
                    callback(null, {
                        ...chunk,
                        inSpeech: inSpeech,
                        startTime: startTime
                    });
                }
                else {
                    callback();
                }
            });
        }
    });
}









