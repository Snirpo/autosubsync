import {Stream, Transform} from "stream";
import {StreamUtils} from "../util/stream-utils";

const TIME_SEPARATOR = " --> ";

export interface SrtLine {
    number: number;
    startTime: number;
    endTime: number;
    text: string;
}

export class Srt {
    static readLinesFromStream(stream: Stream): Promise<SrtLine[]> {
        return StreamUtils.toPromise(
            stream,
            SrtReadStream.create()
        );
    }
}

export class SrtReadStream extends Transform {
    state = 0;
    current: SrtLine = <SrtLine>{number: 0, text: ""};
    buffer = Buffer.alloc(0);

    constructor() {
        super({
            readableObjectMode: true,
            writableObjectMode: false
        });
    }

    _transform(chunk, encoding, callback) {
        this.buffer = this._chunkTransform(Buffer.concat([this.buffer, chunk]), 0);
        callback();
    }

    _chunkTransform(chunk: Buffer, start: number) {
        const end = chunk.indexOf("\n", start);
        if (end > -1) {
            this._processLine(chunk.toString("utf-8", start, end));
            return this._chunkTransform(chunk, end + 1);
        }
        return chunk.slice(start);
    }

    _processLine(line: string) {
        if (line.length === 0) {
            if (this.current) this.push(this.current);
            this.state = 0;
            this.current = <SrtLine>{number: 0, text: ""};
            return;
        }

        switch (this.state) {
            case 0:
                this.current.number = +line;
                this.state++;
                break;
            case 1:
                const times = line.split(TIME_SEPARATOR).map(timeString => SrtReadStream.parseTime(timeString));
                this.current.startTime = times[0];
                this.current.endTime = times[1];
                this.state++;
                break;
            case 2:
                if (this.current.text.length > 0) this.current.text += " ";
                this.current.text += line;
                break;
        }
    }

    private static parseTime(timeStr: string): number {
        const timeArr = timeStr.trim().split(",");
        const hms = timeArr[0].split(":");
        if (timeArr.length !== 2 || hms.length !== 3) throw new Error(`Invalid timestamp: ${timeStr}`);
        return (+hms[0] * 3600000) + (+hms[1] * 60000) + (+hms[2] * 1000) + +timeArr[1];
    }

    static create() {
        return new SrtReadStream();
    }
}