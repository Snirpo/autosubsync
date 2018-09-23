import { Duplex, DuplexOptions } from "stream";
import * as eos from "end-of-stream";

export interface StreamConfig {
    stream: Duplex;
    readMapper: (data: any) => any;
    writeMapper: (data: any) => any;
}

export class MapStream extends Duplex {
    private _ondrain;
    private streamContext: { config: StreamConfig, removeListeners: () => void };

    constructor(private streamConfig: StreamConfig,
                options: DuplexOptions = {}) {
        super(options);
        this._setStream(streamConfig);
    }

    public static obj(mappingConfig: StreamConfig,
                      options: DuplexOptions = {}) {
        options.objectMode = true;
        return new MapStream(mappingConfig, options);
    }

    _write(data, enc, cb) {
        data = this.streamConfig.writeMapper(data);

        if (!this.streamConfig.stream.write(data)) {
            this._ondrain = cb;
            return;
        }

        cb();
    }

    private _setStream(config: StreamConfig) {
        const endListener = eos(config.stream, err => {
            if (err) {
                this.destroy(err);
            }
            else {
                this._removeStream();
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

        this.streamContext = {
            config: config,
            removeListeners: () => {
                config.stream.removeListener('readable', readableListener);
                config.stream.removeListener('drain', drainListener);
                endListener();
            }
        };
    }

    private _removeStream() {
        this.streamContext.removeListeners();
    }

    _read(size) {
        this._forwardRead(this.streamContext.config);
    }

    private _forwardRead(config: StreamConfig) {
        let data;
        while ((data = config.stream.read()) !== null) {
            if (!this.push(config.readMapper(data))) return;
        }
    }

    _final(cb) {
        this.streamContext.config.stream.end();
        this.push(null);
        cb();
    }

    _destroy(err, cb) {
        this.streamContext.config.stream.destroy();

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
