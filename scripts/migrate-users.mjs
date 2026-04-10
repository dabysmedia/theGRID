/**
 * One-time migration: create Carlos user and assign all existing records to him.
 * Run with: node scripts/migrate-users.mjs
 */
import { createHash } from "node:crypto"
import Database from "better-sqlite3"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.resolve(__dirname, "..", "prisma", "dev.db")

function hashPin(pin) {
  return createHash("sha256").update(pin).digest("hex")
}

function cuid() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `cm${ts}${rand}`
}

const db = new Database(dbPath)

const carlosId = cuid()
const now = new Date().toISOString()

db.exec("BEGIN")

try {
  const existing = db.prepare("SELECT id FROM User WHERE name = ?").get("Carlos")
  let userId
  if (existing) {
    userId = existing.id
    console.log(`Carlos already exists with id ${userId}`)
  } else {
    userId = carlosId
    db.prepare(
      "INSERT INTO User (id, name, pinHash, avatarColor, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(userId, "Carlos", hashPin("1234"), "#3b82f6", now, now)
    console.log(`Created Carlos with id ${userId} and PIN 1234`)
  }

  const tables = [
    "CalorieEntry",
    "StepEntry",
    "RunEntry",
    "WorkoutEntry",
    "WorkoutTemplate",
    "WorkoutSession",
    "SleepEntry",
    "Goal",
    "LongGoal",
    "Habit",
    "SavedMeal",
    "AlcoholEntry",
    "BowelEntry",
    "JournalEntry",
  ]

  for (const table of tables) {
    const result = db
      .prepare(`UPDATE ${table} SET userId = ? WHERE userId IS NULL`)
      .run(userId)
    console.log(`  ${table}: backfilled ${result.changes} rows`)
  }

  db.exec("COMMIT")
  console.log("\nMigration complete.")
} catch (e) {
  db.exec("ROLLBACK")
  console.error("Migration failed:", e)
  process.exit(1)
} finally {
  db.close()
}
