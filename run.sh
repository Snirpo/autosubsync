#!/bin/bash
export GOOGLE_APPLICATION_CREDENTIALS=config/speech_auth.json
node dist/cli.js demo/walkingdead.mkv -d 240 -s 0.1 -t 0.8 -r 1 --log debug > output.txt