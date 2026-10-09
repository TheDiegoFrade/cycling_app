#!/bin/bash
cd "$(dirname "$0")"
run(){ echo "=== START $*" >> progress.log; timeout 900 node run.mjs "$@" >> progress.log 2>&1; echo "=== END $* rc=$?" >> progress.log; }
run 1 2
run 2 1 --try-dup --eval; run 2 2
run 3 1 --eval --ftp-change; run 3 2
run 4 1 --eval; run 4 2 --rapid
run 5 1 --eval; run 5 2
run 6 1 --extreme --eval; run 6 2
for i in 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21; do run $i 1 --eval; run $i 2; done
echo "=== ALL DONE" >> progress.log
