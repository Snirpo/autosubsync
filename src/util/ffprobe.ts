import {promisify} from "util";
import {exec} from "child_process";

const execPromise = promisify(exec);

export class FFProbe {
    static getInfo(videoFile: string) {
        return execPromise(`ffprobe -v error -print_format json -show_format -show_streams "${videoFile}"`)
            .then(result => JSON.parse(result.stdout));
    }
}