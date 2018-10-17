import {Transform} from "stream";
import {LOGGER} from "../logger/logger";

export class StopStream extends Transform {
    duration = 0;
    totalDuration = 0;
    finished = false;

    constructor(private stream: any, private maxDuration: number) {
        super({
            objectMode: true
        });
    }

    _transform(chunk: any, encoding, callback) {
        if (this.finished) {
            return callback();
        }

        if (chunk.speech.end) {
            this.totalDuration += chunk.speech.duration;
        }

        if (this.totalDuration >= this.maxDuration) {
            LOGGER.debug("Max duration reached, stopping stream");
            //this.stream.push(null); // A bit hacky...
            //this.stream.destroy();
            this.finished = true;
            this.push(null);
            return callback();
        }

        this.push(chunk);
        return callback();
    }
}