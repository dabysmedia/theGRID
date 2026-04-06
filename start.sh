#!/bin/sh
set -e

echo "[theGRID] Initializing database..."
node scripts/init-db.mjs
echo "[theGRID] Starting server..."
exec node server.js
