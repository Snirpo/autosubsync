set GOOGLE_APPLICATION_CREDENTIALS=config/speech_auth.json
node dist/cli.js demo/bigbang.mkv --logLevel=debug -t 0.80 -d 60000 -c 4 > output.txt