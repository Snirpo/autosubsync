import {DuplexedStream} from "./duplexed-stream";
import * as child_process from "child_process";

export class FfmpegStream {

    static create(args: string[]) {
        const proc = child_process.spawn("ffmpeg", [
            // "-ss",
            // "600",
            "-i",
            "pipe:0",
            ...args,
            "pipe:1"
        ]);
        const stream = DuplexedStream.create(proc.stdout, proc.stdin);
        //proc.stderr.on("data", b => console.log(b.toString()));
        return stream;
    }

}