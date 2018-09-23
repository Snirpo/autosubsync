#!/usr/bin/env node

import {AutoSubSync} from "./index";
import {LOGGER} from "./logger/logger";

require('yargs')
    .command('$0 <videoFile> [srtFile]', 'Synchronize SRT with video file', (yargs) => {
        yargs
            .positional('videoFile', {
                describe: 'Video file'
            })
            .positional('srtFile', {
                describe: 'SRT file'
            })
    }, (argv) => {
        if (argv.verbose) {
            LOGGER.level = "verbose";
        }
        else if (argv.logLevel) {
            LOGGER.level = argv.logLevel;
        }

        LOGGER.debug("args", argv);
        const options = {
            ...argv,
            vad: !argv.disableVad
        };
        if (argv.srtFile) {
            return AutoSubSync.synchronize(argv.videoFile, argv.srtFile, options);
        }
        return AutoSubSync.synchronizeAll(argv.videoFile, options);
    })
    .options({
        seekTime: {
            alias: 's',
            default: 600,
            global: true,
            requiresArg: true,
            type: 'number',
            describe: 'Seek time in video file to start syncing'
        },
        duration: {
            alias: 'd',
            default: 60,
            global: true,
            requiresArg: true,
            type: 'number',
            describe: 'Duration of syncing from seek time'
        },
        minWordMatchCount: {
            alias: 'c',
            default: 4,
            global: true,
            requiresArg: true,
            type: 'number',
            describe: 'Minimum words to match'
        },
        matchTreshold: {
            alias: 't',
            default: 0.80,
            global: true,
            requiresArg: true,
            type: 'number',
            describe: 'Treshold percentage for matching sentences in range 0.00 - 1.00'
        },
        overwrite: {
            alias: 'o',
            default: false,
            global: true,
            requiresArg: false,
            type: 'boolean',
            describe: 'Overwrite original subtitle file'
        },
        postfix: {
            alias: 'p',
            default: 'synced',
            global: true,
            requiresArg: true,
            type: 'string',
            describe: 'Postfix used to name synced subtitles, for example: xxx.en.<postfix>.srt'
        },
        verbose: {
            alias: 'v',
            default: false,
            global: true,
            requiresArg: false,
            type: 'boolean',
            describe: 'Enable verbose logging'
        },
        logLevel: {
            alias: 'log',
            default: 'info',
            global: true,
            requiresArg: true,
            type: 'string',
            describe: 'Set log level'
        },
        dryRun: {
            alias: 'dr',
            default: false,
            global: true,
            requiresArg: false,
            type: 'boolean',
            describe: 'Disable writing to file'
        },
        disableVad: {
            alias: 'dv',
            default: false,
            global: true,
            requiresArg: false,
            type: 'boolean',
            describe: 'Disable voice activation detection'
        },
        language: {
            alias: 'l',
            default: '',
            global: true,
            requiresArg: true,
            type: 'string',
            describe: 'Override SRT file language, otherwise auto-detect from filename'
        }
    })
    .help()
    .strict()
    .config()
    .argv;