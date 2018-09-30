import {Readable, Writable} from "stream";

export class StreamUtils {
    static toPromise(...streams: (Readable | Writable)[]): Promise<any> {
        const stream = streams.reduce((current: any, next: any) => current.pipe(next));
        let data = [];
        stream.on("data", d => data.push(d));

        return StreamUtils.onAllEnd(streams).then(() => data);
    }

    static onAllEnd(streams: (Readable | Writable)[]) {
        return Promise.race([
            StreamUtils.onAllError(streams),
            StreamUtils.onEnd(streams[streams.length - 1]).then(() => {
                StreamUtils.destroyAll(streams);
                return Promise.resolve();
            })
        ]);
    }

    static onAllError(streams: (Readable | Writable)[]) {
        return Promise.race(streams.map(StreamUtils.onError)).catch(err => {
            StreamUtils.destroyAll(streams, err);
            return Promise.reject(err);
        });
    }

    static destroyAll(streams: (Readable | Writable)[], error?: Error) {
        streams.forEach(s => s.destroy(error));
    }

    static onEnd(stream: (Readable | Writable)) {
        let readable = (<any>stream).readable;
        let writable = (<any>stream).writable;

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
        return new Promise((resolve, reject) => {
            stream.on('error', err => reject(err));
        });
    }
}