import {Duplex, DuplexOptions} from "stream";
import {StreamUtils} from "../util/stream-utils";

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

    public static obj(streamConfig: StreamConfig,
                      options: DuplexOptions = {}) {
        options.objectMode = true;
        return new MapStream(streamConfig, options);
    }

    _write(data, enc, cb) {
        if (!this.streamConfig.stream.write(this.streamConfig.writeMapper(data))) {
            this._ondrain = cb;
            return;
        }

        cb();
    }

    private _setStream(config: StreamConfig) {
        StreamUtils.onEnd(config.stream)
            .then(() => this._removeStream())
            .catch(err => this.destroy(err));

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
        this.streamContext.config.stream.end(() => {
            this.push(null);
            cb();
        });
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
