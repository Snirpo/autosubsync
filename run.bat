set GOOGLE_APPLICATION_CREDENTIALS=config/speech_auth.json
node dist/cli.js demo/notinsync.mkv --logLevel=debug -t 0.80 -d 180000 -c 3 > output.txt