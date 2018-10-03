import {FlatMapStream, StreamConfig} from "./flatmapstream";
import * as speech from "@google-cloud/speech";

export class RecognizerStream {
    static create(config: any, keyFile?: string) {
        const speechClient = new speech.SpeechClient({
            keyFilename: keyFile
        });

        return FlatMapStream.obj((data, callback) => {
            if (data.speech.end) {
                return callback();
            }

            if (data.speech.start) {
                const startTime = data.speech.startTime;
                callback(<StreamConfig>{
                    stream: speechClient.streamingRecognize({config: config}),
                    readMapper: data => <any>{
                        speech: {
                            startTime: startTime,
                            ...data
                        }
                    },
                    writeMapper: data => data.audioData
                });
            }
        });
    }
}
