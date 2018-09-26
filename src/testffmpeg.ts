import {FfmpegStream} from "./streams/ffmpeg-stream";
import * as fs from "fs";

const FFMPEG_ARGS = [
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "s16le"
];
const ffMpegStream = FfmpegStream.create(FFMPEG_ARGS);

const input = fs.createReadStream("demo/sample.mkv");
const output = fs.createWriteStream("demo/sample.wav");

input.pipe(ffMpegStream).pipe(output);