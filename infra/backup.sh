#!/bin/sh
set -eu
umask 077
while true; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="/backups/dentlux-$stamp.dump"
  if pg_dump -h db -U dentlux -d dentlux -Fc -f "$target.tmp"; then
    mv "$target.tmp" "$target"
    echo "Hourly backup completed at $stamp"
  else
    echo "Hourly backup failed" >&2
    rm -f "$target.tmp"
  fi
  sleep 3600
done
