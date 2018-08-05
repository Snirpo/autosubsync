import * as Stream from "highland";

import {SrtBlock, SrtReader} from "./srt/srt";

import * as VAD from "node-vad";
import * as FFmpeg from 'fluent-ffmpeg';
import * as speech from "@google-cloud/speech";

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
    model: "video"
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
        const speechClient = new speech.SpeechClient();
        //const writeStream = fs.createWriteStream("test.raw");

        const recognizeStream = speechClient
            .streamingRecognize({
                config: speechConfig,
                //interimResults: true
            });

        Stream(audioStream)
        //.through(recognizeStream)
            .map(createTimestamper())
            .flatMap(createSpeechFilter())
            //.tap(console.log)
            .flatMap(createRecognizer())
            //.tap(console.log)
            // .pipe(recognizeStream)
            // .pipe(createMatcher(lines))
            // .on('error', console.error)
            // .errors(function (err, push) {
            //     console.log('Caught error:', err.message);
            // })
            .each(data => {
                //console.log(JSON.stringify(data));
            });
    });
}

function createTimestamper() {
    let byteCount = 0;
    return (data: Buffer) => {
        const time = timeMultiplier * byteCount;
        byteCount += data.length;
        return {time: time, byteCount: byteCount, data: data};
    }
}

function createRecognizer() {
    const speechClient = new speech.SpeechClient();
    let recognizeStream = null;

    return (obj: { inSpeech: boolean, startTime: number, time: number, data: Buffer }) => {
        //if (obj.inSpeech) {
        if (!recognizeStream) {
            recognizeStream = speechClient.streamingRecognize({
                config: speechConfig,
            });
            //     .map(speechData => {
            //     return {
            //         ...obj,
            //         speech: speechData
            //     }
            // });
        }
        return Stream([obj.data]).tap(console.log).through(recognizeStream);
        // }
        // const stream = recognizeStream;
        // recognizeStream = null;
        // stream.end();
        // return stream;
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
        return vad.processAudioStream(obj.data, audioFrequency).map(event => {
            if (event === VAD.Event.EVENT_ERROR) {
                throw new Error("Error in VAD");
            }

            if (event === VAD.Event.EVENT_VOICE) {
                if (!inSpeech) {
                    startTime = obj.time;
                    inSpeech = true;
                }
            }
            else {
                inSpeech = false;
                startTime = 0;
            }

            return {
                ...obj,
                inSpeech: inSpeech,
                startTime: startTime
            };
        });


    }
}

function through(src, target, selector?) {
    const output = Stream();
    target.pause();
    src.on('error', writeErr);
    target.on('error', writeErr);
    return pipeStream(src, target, selector).pipe(output);

    function writeErr(err) {
        output.write(err);
    }
}

function pipeStream(src, dest, selector?) {
    let resume = null;
    const s = Stream.consume(function (err, x, push, next) {
        let canContinue;
        if (err) {
            src.emit('error', err);
            canContinue = true;
        }
        else if (x === Stream.nil) {
            dest.end();
            return;
        }
        else {
            canContinue = dest.write(x);
        }

        if (canContinue !== false) {
            next();
        }
        else {
            resume = next;
        }
    });

    dest.on('drain', onConsumerDrain);

    // Since we don't keep a reference to piped-to streams,
    // save a callback that will unbind the event handler.
    src._destructors.push(function () {
        dest.removeListener('drain', onConsumerDrain);
    });

    dest.emit('pipe', src);

    s.resume();
    return dest;

    function onConsumerDrain() {
        if (resume) {
            const oldResume = resume;
            resume = null;
            oldResume();
        }
    }
}









