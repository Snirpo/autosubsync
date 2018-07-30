import * as _ from "lodash";
import * as fs from "fs";
import * as readline from "readline";

const TIME_SEPARATOR = " --> ";

export interface SrtLine {
    number: number;
    startTime: number;
    endTime: number;
    text: string;
}

export interface SrtBlock {
    number: number;
    startTime: number;
    endTime: number;
    text: string;
    lines: SrtLine[];
}

export class SrtReader {
    static readLines(inFile: string): Promise<SrtLine[]> {
        return new Promise((resolve, reject) => {
            const lines: SrtLine[] = [];

            const stream = fs.createReadStream(inFile);
            const rl = readline.createInterface({
                input: stream
            });

            stream.on('error', function (err) {
                reject(err);
            });

            let current: SrtLine = <SrtLine>{number: 0, text: ""};
            let state = 0;
            rl.on("line", function (line) {
                if (!line) {
                    lines.push(current);
                    state = 0;
                    current = <SrtLine>{number: 0, text: ""};
                }
                else {
                    switch (state) {
                        case 0:
                            current.number = _.toNumber(line);
                            state++;
                            break;
                        case 1:
                            const times = line.split(TIME_SEPARATOR).map(timeString => SrtReader.parseTime(timeString));
                            current.startTime = times[0];
                            current.endTime = times[1];
                            state++;
                            break;
                        case 2:
                            if (current.text.length > 0) current.text += ' ';
                            current.text += line;
                            break;
                    }
                }
            });

            rl.on('close', function () {
                resolve(lines);
            });
        });
    }

    static readBlocks(inFile: string): Promise<SrtBlock[]> {
        return SrtReader.readLines(inFile).then(lines => SrtReader.linesToBlocks(lines));
    }

    static parseTime(timeStr: string): number {
        const timeArr = timeStr.trim().split(",");
        const hms = timeArr[0].split(":");
        if (timeArr.length !== 2 || hms.length !== 3) throw new Error('invalid time: ' + timeStr);
        return (_.toNumber(hms[0]) * 3600000) + (_.toNumber(hms[1]) * 60000) + (_.toNumber(hms[2]) * 1000) + _.toNumber(timeArr[1]);
    }

    static linesToBlocks(lines: SrtLine[]): SrtBlock[] {
        const blocks: SrtBlock[] = [];

        if (lines.length === 0) {
            return blocks;
        }

        let currentBlock = <SrtBlock>{text: "", lines: []};
        currentBlock.startTime = lines[0].startTime;
        currentBlock.text += lines[0].text + " ";
        currentBlock.lines.push(lines[0]);
        blocks.push(currentBlock);

        let prevLine = lines[0];
        for (let i = 1; i < lines.length; i++) {
            const currentLine = lines[i];

            if (Math.abs(currentLine.startTime - prevLine.endTime) > 100) {
                currentBlock.endTime = prevLine.endTime;

                currentBlock = <SrtBlock>{text: "", lines: []};
                currentBlock.startTime = currentLine.startTime;
                blocks.push(currentBlock);
            }

            currentBlock.text += currentLine.text + " ";
            currentBlock.lines.push(currentLine);

            prevLine = currentLine;
        }

        return blocks;
    }
}