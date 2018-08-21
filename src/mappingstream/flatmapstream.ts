import {Duplex, Readable} from "stream";

export interface StreamSelector {
    (data: any): Duplex;
}

class FlatMapStream extends Duplex {
    private _ondrain;
    private streams: { stream: Duplex, cleaner: () => void }[] = [];

    constructor(private streamSelector: StreamSelector, options) {
        super(options);
    }

    _write(data, enc, cb) {
        const stream = this.streamSelector(data);
        if (this.streams.findIndex(s => s.stream === stream) === -1) {
            this._addStream(stream);
        }

        if (stream.write(data, enc) === false) {
            this._ondrain = cb;
            return;
        }

        cb();
    }

    private _addStream(stream: Duplex) {
        const readableListener = () => this._forwardRead(stream);
        stream.on('readable', readableListener);

        const endListener = () => {
            const index = this.streams.findIndex(s => s.stream === stream);
            if (index > -1) {
                this.streams[index].cleaner();
                this.streams.splice(index, 1);
            }
            if (this.streams.length === 0) {
                this.push(null); // Stream end
            }
        };
        stream.on('end', endListener);

        const drainListener = () => {
            const ondrain = this._ondrain;
            this._ondrain = null;
            if (ondrain) ondrain();
        };
        stream.on('drain', drainListener);

        const errorListener = err => this._throwError(err);
        stream.on('error', errorListener);

        this.streams.push({
            stream: stream, cleaner: () => {
                stream.removeListener('readable', readableListener);
                stream.removeListener('end', endListener);
                stream.removeListener('drain', drainListener);
                stream.removeListener('error', errorListener);
            }
        });
    }

    _throwError(err) {
        for (let stream of this.streams) {
            stream.cleaner();
        }
        this.streams = [];

        const ondrain = this._ondrain;
        this._ondrain = null;
        if (ondrain) {
            ondrain(err)
        }
        else {
            this.emit('error', err);
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
            stream.cleaner();
            stream.stream.end();
        }
        this.streams = [];
        cb();
    }

    _destroy(err, cb) {
        for (let stream of this.streams) {
            stream.cleaner();
            stream.stream.destroy(err);
        }
        this.streams = [];
        this.push(null);
        cb(err);
    }
}