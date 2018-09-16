import {Readable} from "stream";

export class ArrayStream extends Readable {
    private currentIndex = 0;

    constructor(private arr: any[]) {
        super({
            objectMode: true
        });
    }

    _read(size) {
        if (this.currentIndex === this.arr.length) {
            return this.push(null);
        }
        this.push(this.arr[this.currentIndex]);
        this.currentIndex++;
    }

    static create(arr: any[]) {
        return new ArrayStream(arr);
    }
}