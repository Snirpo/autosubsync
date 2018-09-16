import {Readable, Transform, Writable} from "stream";
import {StreamUtils} from "../util/stream-utils";
import {ArrayStream} from "../util/array-stream";

const TIME_SEPARATOR = " --> ";

export interface SrtLine {
    number: number;
    startTime: number;
    endTime: number;
    text: string;
    textLines: string[];
}

export class Srt {
    static readLinesFromStream(stream: Readable): Promise<SrtLine[]> {
        return StreamUtils.toPromise(
            stream,
            SrtReadStream.create()
        );
    }

    static writeLinesToStream(lines: SrtLine[], stream: Writable): Promise<void> {
        return StreamUtils.toPromise(
            ArrayStream.create(lines),
            SrtWriteStream.create(),
            stream
        )
    }
}

export class SrtReadStream extends Transform {
    state = 0;
    current: SrtLine = <SrtLine>{number: 0, text: "", textLines: []};
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
            this.current = <SrtLine>{number: 0, text: "", textLines: []};
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
                this.current.textLines.push(line);
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

export class SrtWriteStream extends Transform {

    constructor() {
        super({
            readableObjectMode: false,
            writableObjectMode: true
        });
    }

    _transform(line: SrtLine, encoding, callback) {
        this._processLine(line);
        callback();
    }

    _processLine(line: SrtLine) {
        const str = `${line.number}\n${SrtWriteStream.timeString(line.startTime)}${TIME_SEPARATOR}${SrtWriteStream.timeString(line.endTime)}\n${line.textLines.join("\n")}\n\n`;
        this.push(str);
    }

    private static timeString(time: number): string {
        const h = Math.floor(time / 3600000);
        time = time - (h * 3600000);
        const m = Math.floor(time / 60000);
        time = time - (m * 60000);
        const s = Math.floor(time / 1000);
        time = time - (s * 1000);
        const ms = Math.floor(time);

        return `${("0" + h).slice(-2)}:${("0" + m).slice(-2)}:${("0" + s).slice(-2)},${("00" + ms).slice(-3)}`;
    }

    static create() {
        return new SrtWriteStream();
    }
}