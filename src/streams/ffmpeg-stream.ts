import * as FFmpeg from 'fluent-ffmpeg';
import {Duplex} from "stream";

export interface FFMPEGStreamConfig {
    seekTime: number;
    duration: number;
    audioFrequency: number;
    bitsPerSample: number;
}