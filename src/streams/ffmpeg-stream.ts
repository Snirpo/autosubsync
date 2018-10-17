import {DuplexedStream} from "./duplexed-stream";
import * as child_process from "child_process";
import {LOGGER} from "../logger/logger";

export class FfmpegStream {

    static create(inputFile: string, seekTime: number) {
        const proc = child_process.spawn("ffmpeg", [
            "-ss",
            seekTime.toString(),
            "-i",
            inputFile,
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "s16le",
            "pipe:1"
        ]);
        proc.stderr.on("data", msg => LOGGER.debug(msg.toString()));
        return DuplexedStream.create(proc.stdout, proc.stdin);
    }

}