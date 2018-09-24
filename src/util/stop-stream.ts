import {PassThrough, Readable, TransformOptions} from "stream";

export class StopStream extends PassThrough {
    constructor(private streamToStop: Readable, private stopFn: (data: any) => boolean, opts: TransformOptions = {}) {
        super(opts);
    }

    _transform(data: any, encoding, callback) {
        if (this.stopFn(data)) {
            console.log("stopping stream")
            this.streamToStop.destroy();
        }
        return callback(null, data);
    }

    static create(streamToStop: Readable, stopFn: (data: any) => boolean, opts: TransformOptions = {}) {
        return new StopStream(streamToStop, stopFn, opts);
    }
}