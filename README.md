# Autosubsync

## Description
This project is in Beta.
The README will be updated in the future.

Autosubsync is a tool for syncing subtitles to video files.

### Prerequisites
- FFmpeg installed. Standard on most Linux distributions. On Windows see: https://ffmpeg.zeranoe.com/builds/. FFmpeg has to be on the system path! 
- You need an Google Speech API key for this tool. Check this quickstart how to set this up:
https://cloud.google.com/speech-to-text/docs/quickstart-client-libraries

### Google Speech API key file
You can provide the Google Speech API key file via the standard environment variable:

GOOGLE_APPLICATION_CREDENTIALS=config/speech_auth.json

Or you can pass it as an commandline variable, for example:

--keyfile=config/speech_auth.json (See below)


### Commandline options

```commandline
autosubsync <videoFile> [srtFile]

Synchronize SRT with video file

Positionals:
  videoFile  Video file --  can also be a glob, like: dir/video*.mkv
  srtFile    SRT file -- If not specified it tries to search for SRT files next to the video file.

Options:
  --version                Show version number                         [boolean]
  --duration, -d           Max duration of syncing in ms
                                                       [number] [default: 60000]
  --minWordMatchCount, -c  Minimum words to match          [number] [default: 4]
  --matchTreshold, -t      Treshold percentage for matching sentences in range
                           0.00 - 1.00                   [number] [default: 0.8]
  --overwrite, -o          Overwrite original subtitle file
                                                      [boolean] [default: false]
  --postfix, -p            Postfix used to name synced subtitles, for example:
                           xxx.en.<postfix>.srt     [string] [default: "synced"]
  --verbose, -v            Enable verbose logging     [boolean] [default: false]
  --logLevel, --log        Set log level              [string] [default: "info"]
  --dryRun, --dr           Disable writing to file    [boolean] [default: false]
  --speechApiKeyFile, --keyfile  Google speech API key file             [string]
  --language, -l           Override SRT file language, otherwise auto-detect
                           from filename                [string] [default: "en"]
  --help                   Show help                                   [boolean]
  --config                 Path to JSON config file
```


