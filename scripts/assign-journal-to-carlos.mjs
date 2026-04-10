#!/usr/bin/env node
/**
 * Data-recovery script: assign orphaned JournalEntry records (userId IS NULL)
 * to the "carlos" user so they appear in the app after a migration.
 *
 * Safe to run multiple times — only touches rows where userId is NULL.
 * Skips silently if the database, User table, or JournalEntry table is missing.
 */
import Database from "better-sqlite3"
import fs from "node:fs"
import { resolveSqliteFilePath } from "./resolve-db-path.mjs"

const CARLOS_ID = "carlos"

const dbPath = resolveSqliteFilePath()
if (!fs.existsSync(dbPath)) {
  console.warn("[assign-journal-to-carlos] Database file not found, skipping:", dbPath)
  process.exit(0)
}

const db = new Database(dbPath)

// Verify required tables exist before touching anything
function tableExists(name) {
  const row = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`)
    .get(name)
  return !!row
}

if (!tableExists("User")) {
  console.warn("[assign-journal-to-carlos] User table not found — run prisma db push first")
  db.close()
  process.exit(0)
}

if (!tableExists("JournalEntry")) {
  console.warn("[assign-journal-to-carlos] JournalEntry table not found — run prisma db push first")
  db.close()
  process.exit(0)
}

// Confirm the carlos user actually exists
const carlosRow = db.prepare(`SELECT id FROM "User" WHERE id = ? LIMIT 1`).get(CARLOS_ID)
if (!carlosRow) {
  console.warn(
    `[assign-journal-to-carlos] User "${CARLOS_ID}" does not exist yet — skipping assignment`
  )
  db.close()
  process.exit(0)
}

// Count orphaned entries before updating
const { orphaned } = db
  .prepare(`SELECT COUNT(*) as orphaned FROM "JournalEntry" WHERE userId IS NULL`)
  .get()

if (orphaned === 0) {
  console.log("[assign-journal-to-carlos] No orphaned JournalEntry records found, nothing to do")
  db.close()
  process.exit(0)
}

// Assign all NULL-userId journal entries to carlos
const result = db
  .prepare(`UPDATE "JournalEntry" SET userId = ? WHERE userId IS NULL`)
  .run(CARLOS_ID)

console.log(
  `[assign-journal-to-carlos] Assigned ${result.changes} orphaned JournalEntry record(s) to user "${CARLOS_ID}"`
)

db.close()
