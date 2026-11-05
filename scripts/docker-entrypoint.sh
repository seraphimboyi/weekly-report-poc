#!/bin/sh
set -e
node /app/scripts/migrate.mjs
exec "$@"
