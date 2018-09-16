import * as Stream from "stream";
import * as eos from "end-of-stream";

export class StreamUtils {
    static toPromise(...streams: Stream[]): Promise<any> {
        return Promise.race([
            StreamUtils.error(streams),
            new Promise(resolve => {
                const stream = streams.reduce((current: any, next: any) => current.pipe(next));
                let data = [];
                stream.on("data", d => data.push(d));
                stream.on("end", () => resolve(data));
            })
        ]);
    }

    static error(streams: any[]) {
        return Promise.race(streams.map(s => {
            return new Promise((resolve, reject) => {
                eos(s, err => {
                    if (err) reject(err);
                })
            });
        })).catch(err => {
            streams.forEach((s: any) => s.destroy(err));
            return Promise.reject(err);
        });
    }
}