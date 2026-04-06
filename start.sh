#!/bin/sh
set -e

echo "[theGRID] Ensuring database schema is up to date..."
npx prisma db push --accept-data-loss 2>/dev/null || npx prisma db push
echo "[theGRID] Database ready."

echo "[theGRID] Starting server..."
exec node server.js
