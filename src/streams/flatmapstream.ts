import {Duplex, DuplexOptions} from "stream";
import * as eos from "end-of-stream";

export interface StreamConfig {
    stream: Duplex;
    readMapper: (data: any) => any;
    writeMapper: (data: any) => any;
}

export interface StreamSelector {
    (data: any): StreamConfig;
}

export class FlatMapStream extends Duplex {
    private _ondrain;
    private streamContextArray: { config: StreamConfig, removeListeners: () => void }[] = [];

    constructor(private streamSelector: StreamSelector,
                options: DuplexOptions = {}) {
        super(options);
    }

    public static obj(streamSelector: StreamSelector,
                      options: DuplexOptions = {}) {
        options.objectMode = true;
        return new FlatMapStream(streamSelector, options);
    }

    _write(data, enc, cb) {
        const config = this.streamSelector(data);
        if (!config) {
            return cb();
        }

        if (this.streamContextArray.findIndex(s => s.config === config) === -1) {
            this._addStream(config);
        }

        data = config.writeMapper(data);
        if (!config.stream.write(data)) {
            this._ondrain = cb;
            return;
        }

        cb();
    }

    private _addStream(config: StreamConfig) {
        const endListener = eos(config.stream, err => {
            if (err) {
                this.destroy(err);
            }
            else {
                this._removeStream(config);
            }
        });

        const readableListener = () => this._forwardRead(config);
        config.stream.on('readable', readableListener);

        const drainListener = () => {
            const ondrain = this._ondrain;
            this._ondrain = null;
            if (ondrain) ondrain();
        };
        config.stream.on('drain', drainListener);

        this.streamContextArray.push({
            config: config,
            removeListeners: () => {
                config.stream.removeListener('readable', readableListener);
                config.stream.removeListener('drain', drainListener);
                endListener();
            }
        });
    }

    private _removeStream(config: StreamConfig) {
        const index = this.streamContextArray.findIndex(s => s.config === config);
        if (index > -1) {
            this.streamContextArray[index].removeListeners();
            this.streamContextArray.splice(index, 1);
        }
    }

    _read(size) {
        for (let context of this.streamContextArray) {
            this._forwardRead(context.config);
        }
    }

    private _forwardRead(config: StreamConfig) {
        let data;
        while ((data = config.stream.read()) !== null) {
            if (!this.push(config.readMapper(data))) return;
        }
    }

    _final(cb) {
        let streamCount = this.streamContextArray.length;
        const countingCallback = () => {
            if (--streamCount === 0) {
                this.push(null);
                cb();
            }
        };

        for (let context of this.streamContextArray) {
            context.config.stream.end(countingCallback);
        }
        this.streamContextArray = [];
    }

    _destroy(err, cb) {
        for (let context of this.streamContextArray) {
            context.config.stream.destroy(err);
        }
        this.streamContextArray = [];

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