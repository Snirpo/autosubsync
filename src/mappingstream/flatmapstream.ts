import {Duplex, Readable} from "stream";
import * as eos from "end-of-stream";

export interface StreamSelector {
    (data: any): Duplex;
}

class FlatMapStream extends Duplex {
    private _ondrain;
    private streams: { stream: Duplex, removeListeners: () => void }[] = [];

    constructor(private streamSelector: StreamSelector, options) {
        super(options);
    }

    _write(data, enc, cb) {
        const stream = this.streamSelector(data);
        if (this.streams.findIndex(s => s.stream === stream) === -1) {
            this._addStream(stream);
        }

        if (!stream.write(data, enc)) {
            this._ondrain = cb;
            return;
        }

        cb();
    }

    private _addStream(stream: Duplex) {
        const endListener = eos(stream, err => {
            if (err) {
                this.destroy(err);
            }
            else {
                this._removeStream(stream);
            }
        });

        const readableListener = () => this._forwardRead(stream);
        stream.on('readable', readableListener);

        const drainListener = () => {
            const ondrain = this._ondrain;
            this._ondrain = null;
            if (ondrain) ondrain();
        };
        stream.on('drain', drainListener);

        this.streams.push({
            stream: stream, removeListeners: () => {
                stream.removeListener('readable', readableListener);
                stream.removeListener('drain', drainListener);
                endListener();
            }
        });
    }

    private _removeStream(stream: Duplex) {
        const index = this.streams.findIndex(s => s.stream === stream);
        if (index > -1) {
            this.streams[index].removeListeners();
            this.streams.splice(index, 1);
        }
        if (this.streams.length === 0) {
            this.end();
        }
    }

    _read(size) {
        for (let stream of this.streams) {
            this._forwardRead(stream.stream);
        }
    }

    private _forwardRead(stream: Readable) {
        let data;
        while ((data = stream.read()) !== null) {
            if (!this.push(data)) return;
        }
    }

    _final(cb) {
        for (let stream of this.streams) {
            stream.removeListeners();
            stream.stream.end();
        }
        this.streams = [];

        cb();
    }

    _destroy(err, cb) {
        for (let stream of this.streams) {
            stream.removeListeners();
            stream.stream.destroy(err);
        }
        this.streams = [];

        const ondrain = this._ondrain;
        this._ondrain = null;
        if (ondrain) {
            ondrain(err);
            cb();
        }
        else {
            cb(err);
        }
    }
}