import {Duplex} from "stream";

const eos = require('end-of-stream');
const shift = require('stream-shift');

const SIGNAL_FLUSH = Buffer.from([0]);

const onuncork = function (self, fn) {
    if (self._corked) self.once('uncork', fn)
    else fn()
};

export abstract class MappingStream extends Duplex {
    private _stream = null;

    private _corked = 1;// start corked
    private _ondrain = null;
    private _drained = false;
    private _forwarding = false;
    private _ended = false;

    private destroyed = false;

    protected constructor(stream: Duplex, opts: any = {}) {
        super(opts);

        this._setStream(stream);
    }

    cork() {
        if (++this._corked === 1) this.emit('cork');
    }

    uncork() {
        if (this._corked && --this._corked === 0) this.emit('uncork');
    }

    private _setStream(stream) {
        if (this.destroyed) {
            stream.destroy();
            return;
        }

        this._stream = stream;

        const ondrain = () => {
            const ondrain = this._ondrain;
            this._ondrain = null;
            if (ondrain) ondrain();
        };

        this._stream.on('drain', ondrain);

        const onreadable = () => {
            this._forward();
        };

        const onend = () => {
            this.push(null);
        };

        this._drained = true;
        this._stream.on('readable', onreadable);
        this._stream.on('end', onend);

        this._forward();

        this.uncork() // always uncork setWritable
    }

    _read() {
        this._drained = true;
        this._forward();
    }

    _forward() {
        if (this._forwarding || !this._drained) return;
        this._forwarding = true;

        let data;

        while (this._drained && (data = shift(this._stream)) !== null) {
            if (this.destroyed) continue;
            const mappedData = this._mapRead(data);
            if (mappedData) {
                this._drained = this.push(mappedData);
            }
        }

        this._forwarding = false
    }

    abstract _mapRead(data);

    destroy(err) {
        if (this.destroyed) return;
        this.destroyed = true;

        process.nextTick(() => {
            this._destroy(err);
        })
    }

    _destroy(err) {
        if (err) {
            const ondrain = this._ondrain;
            this._ondrain = null;
            if (ondrain) {
                ondrain(err)
            }
            else {
                this.emit('error', err);
            }
        }

        this._stream.destroy();

        this.emit('close');
    }

    _write(data, enc, cb) {
        if (this.destroyed) return cb();
        if (this._corked) return onuncork(this, this._write.bind(this, data, enc, cb));
        if (data === SIGNAL_FLUSH) return this._finish(cb);

        const mappedData = this._mapWrite(data);

        if (!mappedData) {
            return cb();
        }

        if (this._stream.write(mappedData, enc) === false) {
            this._ondrain = cb;
        }
        else {
            cb()
        }
    }

    abstract _mapWrite(data);

    _finish(cb) {
        this.emit('preend');
        onuncork(this, () => {
            const endFn = () => {
                // haxx to not emit prefinish twice
                if ((<any>this)._writableState.prefinished === false) (<any>this)._writableState.prefinished = true;
                this.emit('prefinish');
                onuncork(this, cb);
            };
            if (this._stream._writableState.finished) return endFn();
            return this._stream.end(endFn);
        })
    }

    end(data?, enc?, cb?) {
        if (typeof data === 'function') return this.end(null, null, data);
        if (typeof enc === 'function') return this.end(data, null, enc);
        this._ended = true;
        if (data) this.write(data);
        if (!(<any>this)._writableState.ending) this.write(SIGNAL_FLUSH);
        return super.end(cb);
    }
}