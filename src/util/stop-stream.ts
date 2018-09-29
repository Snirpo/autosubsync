import {Transform} from "stream";

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

        if (chunk.speech.start) {
            this.totalDuration += this.duration;
        }
        this.duration = chunk.speech.duration;
        if (this.totalDuration >= this.maxDuration) {
            this.stream.push(null); // A bit hacky...
            this.stream.close();
            this.finished = true;
            this.push(null);
            return callback();
        }
        this.push(chunk);
        return callback();
    }
}