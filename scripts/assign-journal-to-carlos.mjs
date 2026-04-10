#!/usr/bin/env node
/**
 * One-time data recovery: find or create the "carlos" user and assign all
 * orphaned JournalEntry records (userId IS NULL) to that user.
 *
 * Usage:
 *   node scripts/assign-journal-to-carlos.mjs
 *
 * Respects the same DATABASE_PATH / DATA_DIR env vars used by the app, so it
 * will automatically target /data/thegrid.db on Railway.
 */

import { scryptSync, randomBytes } from "node:crypto"
import Database from "better-sqlite3"
import fs from "node:fs"
import { resolveSqliteFilePath } from "./resolve-db-path.mjs"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashPin(pin) {
  const salt = randomBytes(16).toString("hex")
  const derived = scryptSync(pin, salt, 32).toString("hex")
  return `scrypt$${salt}$${derived}`
}

function cuid() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `cm${ts}${rand}`
}

// ---------------------------------------------------------------------------
// Resolve DB path
// ---------------------------------------------------------------------------

const dbPath = resolveSqliteFilePath()
console.log("[assign-journal-to-carlos] Using database:", dbPath)

if (!fs.existsSync(dbPath)) {
  console.error("[assign-journal-to-carlos] Database file not found:", dbPath)
  console.error("  Run `prisma db push` first to initialise the schema.")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

const db = new Database(dbPath)

// Verify the required tables exist before touching anything.
function tableExists(name) {
  return !!db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`)
    .get(name)
}

if (!tableExists("User")) {
  console.error("[assign-journal-to-carlos] User table not found — run `prisma db push` first.")
  db.close()
  process.exit(1)
}

if (!tableExists("JournalEntry")) {
  console.error("[assign-journal-to-carlos] JournalEntry table not found — run `prisma db push` first.")
  db.close()
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Count orphaned entries upfront
// ---------------------------------------------------------------------------

const { orphaned } = db
  .prepare(`SELECT COUNT(*) AS orphaned FROM "JournalEntry" WHERE userId IS NULL`)
  .get()

console.log(`[assign-journal-to-carlos] Orphaned JournalEntry rows (userId IS NULL): ${orphaned}`)

if (orphaned === 0) {
  console.log("[assign-journal-to-carlos] Nothing to do — all journal entries already have a userId.")
  db.close()
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Find or create the carlos user (case-insensitive name match)
// ---------------------------------------------------------------------------

const migrate = db.transaction(() => {
  let carlos = db
    .prepare(`SELECT id, name FROM "User" WHERE lower(name) = 'carlos' LIMIT 1`)
    .get()

  let carlosId
  if (carlos) {
    carlosId = carlos.id
    console.log(`[assign-journal-to-carlos] Found existing user "${carlos.name}" (id: ${carlosId})`)
  } else {
    carlosId = cuid()
    const pinHash = hashPin("1234")
    db.prepare(
      `INSERT INTO "User" (id, name, pinHash, avatarColor, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(carlosId, "carlos", pinHash, "#22c55e")
    console.log(`[assign-journal-to-carlos] Created new user "carlos" (id: ${carlosId}, PIN: 1234)`)
  }

  // Assign all orphaned journal entries to carlos.
  const result = db
    .prepare(`UPDATE "JournalEntry" SET userId = ? WHERE userId IS NULL`)
    .run(carlosId)

  return { carlosId, updated: result.changes }
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

try {
  const { carlosId, updated } = migrate()
  console.log(`[assign-journal-to-carlos] ✓ Assigned ${updated} JournalEntry record(s) to carlos (id: ${carlosId})`)
} catch (err) {
  console.error("[assign-journal-to-carlos] ✗ Migration failed:", err)
  db.close()
  process.exit(1)
}

db.close()
console.log("[assign-journal-to-carlos] Done.")
