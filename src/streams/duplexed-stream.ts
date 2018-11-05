import {Duplex, DuplexOptions, Readable, Writable} from "stream";
import {StreamUtils} from "../util/stream-utils";

export class DuplexedStream extends Duplex {
    private _ondrain;
    private _readableListeners;
    private _writableListeners;
    private _readable: Readable;
    private _writable: Writable;

    constructor(readable: Readable, writable: Writable, opts: DuplexOptions = {}) {
        super(opts);
        this._setStream(readable, writable);
    }

    _write(data, enc, cb) {
        if (!this._writable.write(data)) {
            this._ondrain = cb;
            return;
        }

        cb();
    }

    private _setStream(readable: Readable, writable: Writable) {
        StreamUtils.onEnd(readable).then(() => {
            this._readableListeners();
            this.push(null);
        }).catch(err => this.destroy(err));

        StreamUtils.onEnd(writable)
            .then(() => this._writableListeners())
            .catch(err => this.destroy(err));

        const readableListener = () => this._forwardRead(readable);
        readable.on('readable', readableListener);

        const drainListener = () => {
            const ondrain = this._ondrain;
            this._ondrain = null;
            if (ondrain) ondrain();
        };
        writable.on('drain', drainListener);

        this._readableListeners = () => readable.removeListener('readable', readableListener);
        this._writableListeners = () => writable.removeListener('drain', drainListener);

        this._readable = readable;
        this._writable = writable;
    }

    _read(size) {
        this._forwardRead(this._readable);
    }

    private _forwardRead(readable: Readable) {
        let data;
        while ((data = readable.read()) !== null) {
            if (!this.push(data)) return;
        }
    }

    _final(cb) {
        this._writable.end(cb);
    }

    _destroy(err, cb) {
        this._readable.destroy(err);
        this._writable.destroy(err);

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

    static create(readable: Readable, writable: Writable, opts: DuplexOptions = {}) {
        return new DuplexedStream(readable, writable, opts);
    }
}