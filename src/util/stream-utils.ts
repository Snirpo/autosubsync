import {Readable, Writable} from "stream";
import * as eos from "end-of-stream";

export class StreamUtils {
    static toPromise(...streams: (Readable | Writable)[]): Promise<any> {
        return Promise.race([
            StreamUtils.onAllError(streams),
            new Promise(resolve => {
                const stream = streams.reduce((current: any, next: any) => current.pipe(next));
                let data = [];
                stream.on("data", d => data.push(d));
                eos(stream, err => {
                    if (!err) resolve(data)
                });
            })
        ]);
    }

    static onAllError(streams: (Readable | Writable)[]) {
        return Promise.race(streams.map(s => StreamUtils.onError(s))).catch(err => {
            streams.forEach(s => s.destroy(err));
            return Promise.reject(err);
        });
    }

    static onAllEnd(streams: (Readable | Writable)[]) {
        return Promise.all(streams.map(s => StreamUtils.onEnd(s))).catch(err => {
            streams.forEach(s => s.destroy(err));
            return Promise.reject(err);
        });
    }

    static onEnd(stream: (Readable | Writable)) {
        let readable = (<any>stream).readable;
        let writable = (<any>stream).writable;

        if (!readable && !writable) {
            return Promise.reject("Stream not readable and not writable, already finished?");
        }

        return new Promise((resolve, reject) => {
            stream.on('end', () => {
                readable = false;
                if (!writable) resolve();
            });

            stream.on('finish', () => {
                writable = false;
                if (!readable) resolve();
            });

            stream.on('error', err => reject(err));
        });
    }

    static onError(stream: (Readable | Writable)) {
        const readable = (<any>stream).readable;
        const writable = (<any>stream).writable;

        if (!readable && !writable) {
            return Promise.reject("Stream not readable and not writable, already finished?");
        }

        return new Promise((resolve, reject) => {
            stream.on('error', err => reject(err));
        });
    }
}