#!/usr/bin/env node
/**
 * One-time data recovery: find or create the "carlos" user and assign all
 * orphaned health-tracking records (userId IS NULL) across every health table
 * to that user.
 *
 * Tables covered:
 *   CalorieEntry, StepEntry, RunEntry, SleepEntry, SavedMeal,
 *   AlcoholEntry, BowelEntry, WorkoutEntry, WorkoutSession,
 *   Goal, LongGoal, Habit
 *
 * Usage:
 *   node scripts/assign-health-data-to-carlos.mjs
 *
 * Respects the same DATABASE_PATH / DATA_DIR env vars used by the app, so it
 * will automatically target /data/thegrid.db on Railway.
 */

import { scryptSync, randomBytes } from "node:crypto"
import Database from "better-sqlite3"
import fs from "node:fs"
import { resolveSqliteFilePath } from "./resolve-db-path.mjs"

const LABEL = "[assign-health-data-to-carlos]"

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
console.log(`${LABEL} Using database: ${dbPath}`)

if (!fs.existsSync(dbPath)) {
  console.error(`${LABEL} Database file not found: ${dbPath}`)
  console.error("  Run `prisma db push` first to initialise the schema.")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

const db = new Database(dbPath)

function tableExists(name) {
  return !!db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`)
    .get(name)
}

// ---------------------------------------------------------------------------
// Verify required tables exist
// ---------------------------------------------------------------------------

const HEALTH_TABLES = [
  "CalorieEntry",
  "StepEntry",
  "RunEntry",
  "SleepEntry",
  "SavedMeal",
  "AlcoholEntry",
  "BowelEntry",
  "WorkoutEntry",
  "WorkoutSession",
  "Goal",
  "LongGoal",
  "Habit",
]

if (!tableExists("User")) {
  console.error(`${LABEL} User table not found — run \`prisma db push\` first.`)
  db.close()
  process.exit(1)
}

const missingTables = HEALTH_TABLES.filter((t) => !tableExists(t))
if (missingTables.length > 0) {
  console.warn(`${LABEL} Warning: the following tables were not found and will be skipped:`)
  missingTables.forEach((t) => console.warn(`  - ${t}`))
}

const presentTables = HEALTH_TABLES.filter((t) => tableExists(t))

// ---------------------------------------------------------------------------
// Count orphaned rows upfront
// ---------------------------------------------------------------------------

console.log(`\n${LABEL} Orphaned rows (userId IS NULL) before migration:`)
let totalOrphaned = 0
for (const table of presentTables) {
  const { count } = db
    .prepare(`SELECT COUNT(*) AS count FROM "${table}" WHERE userId IS NULL`)
    .get()
  console.log(`  ${table}: ${count}`)
  totalOrphaned += count
}

if (totalOrphaned === 0) {
  console.log(`\n${LABEL} Nothing to do — all health entries already have a userId.`)
  db.close()
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Find or create the carlos user, then assign all orphaned rows
// ---------------------------------------------------------------------------

const migrate = db.transaction(() => {
  // Find or create carlos
  let carlos = db
    .prepare(`SELECT id, name FROM "User" WHERE lower(name) = 'carlos' LIMIT 1`)
    .get()

  let carlosId
  if (carlos) {
    carlosId = carlos.id
    console.log(`\n${LABEL} Found existing user "${carlos.name}" (id: ${carlosId})`)
  } else {
    carlosId = cuid()
    const pinHash = hashPin("1234")
    db.prepare(
      `INSERT INTO "User" (id, name, pinHash, avatarColor, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(carlosId, "carlos", pinHash, "#22c55e")
    console.log(`\n${LABEL} Created new user "carlos" (id: ${carlosId}, PIN: 1234)`)
  }

  // Update each table
  const results = {}
  for (const table of presentTables) {
    const { changes } = db
      .prepare(`UPDATE "${table}" SET userId = ? WHERE userId IS NULL`)
      .run(carlosId)
    results[table] = changes
  }

  return { carlosId, results }
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

try {
  const { carlosId, results } = migrate()

  console.log(`\n${LABEL} ✓ Results (rows assigned to carlos, id: ${carlosId}):`)
  let totalUpdated = 0
  for (const [table, count] of Object.entries(results)) {
    console.log(`  ${table}: ${count}`)
    totalUpdated += count
  }
  console.log(`\n${LABEL} ✓ Total rows assigned: ${totalUpdated}`)
} catch (err) {
  console.error(`${LABEL} ✗ Migration failed:`, err)
  db.close()
  process.exit(1)
}

db.close()
console.log(`${LABEL} Done.`)
