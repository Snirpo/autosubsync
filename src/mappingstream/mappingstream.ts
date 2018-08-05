import {Duplex} from "stream";

const eos = require('end-of-stream');
const shift = require('stream-shift');

const SIGNAL_FLUSH = Buffer.from([0]);

const onuncork = function (self, fn) {
    if (self._corked) self.once('uncork', fn);
    else fn()
};

export class MappingStream extends Duplex {
    private _writable = null;
    private _readable = null;

    private _corked = 1;// start corked
    private _ondrain = null;
    private _drained = false;
    private _forwarding = false;
    private _unwrite = null;
    private _unread = null;
    private _ended = false;

    private destroyed = false;

    constructor(writable, readable, opts: any = {}) {
        super(opts);

        this.setWritable(writable);
        this.setReadable(readable);
    }

    static obj(writable, readable, opts: any = {}) {
        opts.objectMode = true;
        opts.highWaterMark = 16;
        return new MappingStream(writable, readable, opts)
    }

    static of(writable, readable, opts: any = {}) {
        return new MappingStream(writable, readable, opts);
    }

    static ofDuplex(stream, opts: any = {}) {
        return new MappingStream(stream, stream, opts);
    }

    cork() {
        if (++this._corked === 1) this.emit('cork');
    }

    uncork() {
        if (this._corked && --this._corked === 0) this.emit('uncork');
    }

    setWritable(writable) {
        if (this._unwrite) this._unwrite();

        if (this.destroyed) {
            if (writable && writable.destroy) writable.destroy();
            return;
        }

        if (writable === null || writable === false) {
            this.end();
            return;
        }

        const unend = eos(writable, {writable: true, readable: false}, (err) => {
            if (err) this.destroy(err.message === 'premature close' ? null : err);
            else if (!this._ended) this.end()
        });

        const ondrain = () => {
            const ondrain = this._ondrain;
            this._ondrain = null;
            if (ondrain) ondrain();
        };

        const clear = () => {
            this._writable.removeListener('drain', ondrain);
            unend()
        };

        if (this._unwrite) process.nextTick(ondrain); // force a drain on stream reset to avoid livelocks

        this._writable = writable;
        this._writable.on('drain', ondrain);
        this._unwrite = clear;

        this.uncork() // always uncork setWritable
    }

    setReadable(readable) {
        if (this._unread) this._unread();

        if (this.destroyed) {
            if (readable && readable.destroy) readable.destroy();
            return
        }

        if (!readable) {
            this.push(null);
            this.resume();
            return;
        }

        const unend = eos(readable, {writable: false, readable: true}, (err) => {
            if (err) this.destroy(err.message === 'premature close' ? null : err);
            else if (!this._ended) this.end()
        });

        const onreadable = () => {
            this._forward();
        };

        const onend = () => {
            this.push(null);
        };

        const clear = () => {
            this._readable.removeListener('readable', onreadable);
            this._readable.removeListener('end', onend);
            unend();
        };

        this._drained = true;
        this._readable = readable;
        this._readable.on('readable', onreadable);
        this._readable.on('end', onend);
        this._unread = clear;

        this._forward();
    }

    _read() {
        this._drained = true;
        this._forward();
    }

    _forward() {
        if (this._forwarding || !this._drained) return;
        this._forwarding = true;

        let data;

        while (this._drained && (data = shift(this._readable)) !== null) {
            if (this.destroyed) continue;
            this._drained = this.push(data)
        }

        this._forwarding = false
    }

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
            if (ondrain) ondrain(err);
            else this.emit('error', err);
        }

        this._readable.destroy();
        this._writable.destroy();

        this.emit('close');
    }

    _write(data, enc, cb) {
        if (this.destroyed) return cb();
        if (this._corked) return onuncork(this, this._write.bind(this, data, enc, cb));
        if (data === SIGNAL_FLUSH) return this._finish(cb);

        if (this._writable.write(data) === false) this._ondrain = cb;
        else cb()
    }

    _finish(cb) {
        this.emit('preend');
        onuncork(this, () => {
            const endFn = () => {
                // haxx to not emit prefinish twice
                if ((<any>this)._writableState.prefinished === false) (<any>this)._writableState.prefinished = true;
                this.emit('prefinish');
                onuncork(this, cb);
            };
            if (this._writable._writableState.finished) return endFn();
            return this._writable.end(endFn);
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