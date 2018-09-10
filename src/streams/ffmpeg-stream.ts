import * as FFmpeg from 'fluent-ffmpeg';
import {Duplex} from "stream";

export interface FFMPEGStreamConfig {
    seekTime: number;
    duration: number;
    audioFrequency: number;
    bitsPerSample: number;
}

export class FFMPEGStream {
    static create(inFile: string, config: FFMPEGStreamConfig): Duplex {
        return FFmpeg(inFile)
            .seekInput(config.seekTime)
            .duration(config.duration)
            .withAudioChannels(1)
            .withAudioFrequency(config.audioFrequency)
            .toFormat('s' + config.bitsPerSample.toString() + 'le')
            .pipe();
    }
}