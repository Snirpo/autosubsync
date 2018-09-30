import {Transform} from "stream";
import {LOGGER} from "../logger/logger";

export class LoggerStream extends Transform {
    constructor() {
        super({
            objectMode: true
        });
    }

    _transform(chunk: any, encoding, callback) {
        LOGGER.info(`chunk ${chunk.length}`);
        return callback(null, chunk);
    }
}