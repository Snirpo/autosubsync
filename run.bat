set GOOGLE_APPLICATION_CREDENTIALS=config/speech_auth.json
node dist/cli.js demo/walkingdead.mkv --logLevel=debug -t 0.60 -d 60 -s 0 -r 1 > output.txt