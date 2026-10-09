#!/bin/bash
cd "$(dirname "$0")"
run(){ echo "=== START $*" >> progress.log; timeout 900 node run.mjs "$@" >> progress.log 2>&1; echo "=== END $* rc=$?" >> progress.log; }
run 1 3 --rapid --tag=concurrency
run 4 1 --eval --clean --tag=clean; run 4 2 --clean --tag=clean
run 14 1 --eval --clean --tag=clean; run 14 2 --clean --tag=clean
run 15 1 --eval --clean --tag=clean; run 15 2 --clean --tag=clean
if grep -q "HTTP 502" out/s21-r1/log.txt out/s21-r2/log.txt 2>/dev/null; then run 21 1 --eval --clean --tag=clean; run 21 2 --clean --tag=clean; fi
run 8 1 --eval --tag=rerun
run 9 1 --eval --tag=rerun
run 5 3 --eval --tag=publish
run 13 3 --eval --tag=publish
echo "=== EXTRAS DONE" >> progress.log
