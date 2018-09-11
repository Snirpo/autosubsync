import * as Stream from "stream";
import * as eos from "end-of-stream";

export class StreamUtils {
    static toPromise(...streams: Stream[]): Promise<any> {
        return new Promise((resolve, reject) => {
            const listeners = streams.map(s => {
                return eos(s, err => {
                    if (err) {
                        listeners.forEach(unregisterFn => unregisterFn());
                        streams.forEach((stream: any) => stream.destroy());
                        reject(err);
                    }
                });
            });

            const stream = streams.reduce((current: any, next: any) => current.pipe(next));
            let data = [];
            stream.on("data", d => data.push(d));
            stream.on("end", () => resolve(data));
        });
    }
}