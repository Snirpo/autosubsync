#!/usr/bin/env node

import {AutoSubSync} from "./index";
import {LOGGER} from "./logger/logger";

require('yargs')
    .command('$0 <videoFile> [srtFile]', 'Synchronize subtitles with video file.', (yargs) => {
        yargs
            .positional('videoFile', {
                describe: 'Video file. Can also be a glob, like: dir/video*.mkv'
            })
            .positional('srtFile', {
                describe: 'SRT file. If not specified it tries to search for SRT files next to the video file.'
            })
    }, (argv) => {
        if (argv.verbose) {
            LOGGER.level = "verbose";
        }
        else if (argv.logLevel) {
            LOGGER.level = argv.logLevel;
        }

        LOGGER.debug("args", argv);
        if (argv.srtFile) {
            return AutoSubSync.synchronize(argv.videoFile, argv.srtFile, argv);
        }
        return AutoSubSync.synchronizeAll(argv.videoFile, argv);
    })
    .options({
        runCount: {
            alias: 'r',
            default: 1,
            global: true,
            requiresArg: true,
            type: 'number',
            describe: 'Number of runs with different positions in the video file to try matching subtitles'
        },
        seekPercentage: {
            alias: 's',
            default: 0.0,
            global: true,
            requiresArg: true,
            type: 'number',
            describe: 'Seek percentage (0.00 - 1.00) in video file to start matching'
        },
        duration: {
            alias: 'd',
            default: 60,
            global: true,
            requiresArg: true,
            type: 'number',
            describe: 'Max duration of syncing in seconds'
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
        language: {
            alias: 'l',
            default: 'en',
            global: true,
            requiresArg: true,
            type: 'string',
            describe: 'Override SRT file language, otherwise auto-detect from filename'
        },
        speechApiKeyFile: {
            alias: 'keyfile',
            default: undefined,
            global: true,
            requiresArg: true,
            type: 'string',
            describe: 'Google speech API key file'
        }
    })
    .help()
    .strict()
    .config()
    .argv;