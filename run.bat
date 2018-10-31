set GOOGLE_APPLICATION_CREDENTIALS=config/speech_auth.json
node dist/cli.js demo/sup.mkv -d 60 -s 0.1 -o -t 0.8 -r 1 --log debug > output.txt