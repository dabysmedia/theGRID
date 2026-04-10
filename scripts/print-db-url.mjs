#!/usr/bin/env node
/**
 * Prints a single line: the effective SQLite DATABASE_URL for this process.
 * Used by start.sh so the shell exports the same URL Prisma resolves (volume wins).
 */
import { resolveSqliteFilePath } from "./resolve-db-path.mjs"

const hasVolume =
  process.env.DATABASE_PATH?.trim() || process.env.DATA_DIR?.trim()
if (hasVolume) {
  process.stdout.write(`file:${resolveSqliteFilePath()}`)
} else if (process.env.DATABASE_URL?.trim()) {
  process.stdout.write(process.env.DATABASE_URL.trim())
} else {
  process.stdout.write(`file:${resolveSqliteFilePath()}`)
}
