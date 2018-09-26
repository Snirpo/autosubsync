import {DuplexedStream} from "./duplexed-stream";
import * as child_process from "child_process";

export class FfmpegStream {

    static create(args: string[]) {
        const process = child_process.spawn("ffmpeg", [
            "-i",
            "pipe:0",
            ...args,
            "pipe:1"
        ]);
        return DuplexedStream.create(process.stdout, process.stdin);
    }

}