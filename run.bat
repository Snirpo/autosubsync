set GOOGLE_APPLICATION_CREDENTIALS=config/speech_auth.json
node dist/cli.js demo/sample.mkv --logLevel=debug -t 0.70 -d 60000 > output.txt