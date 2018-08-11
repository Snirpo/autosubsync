import {SrtLine, SrtReader} from "./srt/srt";

import * as FFmpeg from 'fluent-ffmpeg';
import * as speech from "@google-cloud/speech";
import {Transform} from "stream";
import {Matcher} from "./matcher/matcher";

const inFile = process.argv[2];
const srtFile = process.argv[3];

const audioChannels = 1;
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
            .pipe(createRecognizer())
            .pipe(createMatcher(lines, seekTimeMs))
            .on("error", console.log)
            .on("data", data => {
                console.log(JSON.stringify(data, null, 2));
                //console.log(data);
            });
    });
}

function createRecognizer() {
    const speechClient = new speech.SpeechClient();

    return speechClient.streamingRecognize({
        config: speechConfig,
        //interimResults: true
    });
}

function createMatcher(lines: SrtLine[], seekTime: number): Transform {
    let index = 0;
    let average = 0;

    return new Transform({
        objectMode: true,
        transform: (data: any, _, done) => {
            const matches = [];

            //console.log(data.results.length);
            const alternatives = data.results[0].alternatives;
            //console.log(data);
            //for (let i = 0; i < alternatives.length; i++) {
            const alternative = alternatives[0];
            const transcript = alternative.transcript;

            for (let j = index; j < lines.length; j++) {
                const line = lines[j];
                const matchPercentage = Matcher.calculateSentenceMatchPercentage(transcript, line.text);

                if (matchPercentage > matchTreshold) {
                    const startTime = toMillis(alternative.words[0].startTime);
                    const endTime = toMillis(alternative.words[alternative.words.length - 1].endTime);

                    matches.push({
                        index: j,
                        line: line,
                        hyp: {
                            transcript: transcript,
                            startTime: seekTime + startTime,
                            endTime: seekTime + endTime
                        },
                        matchPercentage: matchPercentage
                    });
                }
            }
            //}

            //console.log(JSON.stringify(matches, null, 2));
            if (matches.length == 1) {
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