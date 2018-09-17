#!/usr/bin/env node

import {AutoSubSync} from "./index";

require('yargs')
    .command('$0 [videoFile] [srtFile]', 'Synchronize SRT with video', (yargs) => {
        yargs
            .positional('videoFile', {
                describe: 'Video file'
            })
            .positional('srtFile', {
                describe: 'SRT file'
            })
    }, (argv) => {
        AutoSubSync.synchronize(argv.videoFile, argv.srtFile, {
            duration: 60,
            minWordMatchCount: 4,
            maxWordShift: 8
        });
    })
    .help()
    .argv;