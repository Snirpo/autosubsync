import {FlatMapStream, StreamConfig} from "./flatmapstream";
import * as speech from "@google-cloud/speech";

export class RecognizerStream {
    static create(config: any) {
        const speechClient = new speech.SpeechClient();
        let currentStream: StreamConfig = null;

        return FlatMapStream.obj(data => {
            if (data.speech.start) {
                const startTime = data.speech.startTime;
                currentStream = <StreamConfig>{
                    stream: speechClient.streamingRecognize({config: config}),
                    readMapper: data => <any>{
                        startTime: startTime,
                        speech: data
                    },
                    writeMapper: data => {
                        return data.audioData;
                    }
                }
            }
            return currentStream;
        });
    }
}