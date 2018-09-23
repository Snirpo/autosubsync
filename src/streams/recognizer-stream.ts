import {FlatMapStream, StreamConfig} from "./flatmapstream";
import * as speech from "@google-cloud/speech";
import {MapStream} from "./mapstream";

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
                        speech: {
                            startTime: startTime,
                            ...data
                        }
                    },
                    writeMapper: data => {
                        return data.audioData;
                    }
                };
            }
            return currentStream;
        });
    }

    static createWithoutVAD(config: any) {
        const speechClient = new speech.SpeechClient();

        return MapStream.obj({
            stream: speechClient.streamingRecognize({config: config}),
            readMapper: data => <any>{
                speech: {
                    startTime: 0,
                    ...data
                }
            },
            writeMapper: data => data
        });
    }
}
