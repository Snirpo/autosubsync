import {Srt} from "./srt/srt";
import * as fs from "fs";

Srt.readBlocksFromStream(fs.createReadStream("demo/difficult.srt")).then(blocks => console.log(JSON.stringify(blocks, null, 2)));