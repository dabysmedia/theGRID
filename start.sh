#!/bin/sh
set -e
cd "$(dirname "$0")"
exec node scripts/prod-entry.mjs
