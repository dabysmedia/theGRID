/**
 * @deprecated Legacy hand-written schema — NOT used by start.sh / prod-entry.mjs.
 * Production uses `prisma db push` so the DB always matches prisma/schema.prisma (User, Journal, userId, etc.).
 */

console.error(
  "[init-db] This script is deprecated. Boot uses scripts/prod-entry.mjs → prisma db push."
)
process.exit(1)
