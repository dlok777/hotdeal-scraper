#!/bin/sh
set -eu

INTERVAL_SECONDS="${RUN_INTERVAL_SECONDS:-600}"

echo "Starting scheduler. Interval: ${INTERVAL_SECONDS}s"

while true
do
  echo "[$(date -Iseconds)] Job started"
  node app.js || echo "[$(date -Iseconds)] Job failed, next run continues"
  echo "[$(date -Iseconds)] Job finished. Sleeping ${INTERVAL_SECONDS}s"
  sleep "${INTERVAL_SECONDS}"
done
