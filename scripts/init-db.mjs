/**
 * Initializes the SQLite database schema directly via better-sqlite3.
 * Runs at container startup — no Prisma CLI needed in production.
 * All statements use IF NOT EXISTS so it's safe to run on every boot.
 */

import Database from "better-sqlite3"
import path from "node:path"
import fs from "node:fs"

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve("prisma", "dev.db")

const dir = path.dirname(dbPath)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

const db = new Database(dbPath)

db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS "CalorieEntry" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "date"        DATETIME NOT NULL,
    "mealType"    TEXT NOT NULL,
    "description" TEXT,
    "calories"    INTEGER NOT NULL,
    "protein"     REAL,
    "carbs"       REAL,
    "fat"         REAL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "CalorieEntry_date_idx" ON "CalorieEntry"("date");

  CREATE TABLE IF NOT EXISTS "StepEntry" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "date"      DATETIME NOT NULL,
    "count"     INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "StepEntry_date_idx" ON "StepEntry"("date");

  CREATE TABLE IF NOT EXISTS "RunEntry" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "date"        DATETIME NOT NULL,
    "distance"    REAL NOT NULL,
    "duration"    INTEGER NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'outdoor',
    "notes"       TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "RunEntry_date_idx" ON "RunEntry"("date");

  CREATE TABLE IF NOT EXISTS "WorkoutEntry" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "date"      DATETIME NOT NULL,
    "type"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "duration"  INTEGER,
    "notes"     TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "WorkoutEntry_date_idx" ON "WorkoutEntry"("date");

  CREATE TABLE IF NOT EXISTS "SleepEntry" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "date"      DATETIME NOT NULL,
    "bedtime"   DATETIME NOT NULL,
    "wakeTime"  DATETIME NOT NULL,
    "quality"   INTEGER NOT NULL,
    "notes"     TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "SleepEntry_date_idx" ON "SleepEntry"("date");

  CREATE TABLE IF NOT EXISTS "Goal" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "category"  TEXT NOT NULL,
    "target"    REAL NOT NULL,
    "unit"      TEXT NOT NULL,
    "deadline"  DATETIME,
    "active"    BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "Goal_category_idx" ON "Goal"("category");

  CREATE TABLE IF NOT EXISTS "LongGoal" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "name"       TEXT NOT NULL,
    "category"   TEXT NOT NULL,
    "target"     REAL NOT NULL,
    "unit"       TEXT NOT NULL,
    "direction"  TEXT NOT NULL DEFAULT 'up',
    "startValue" REAL,
    "active"     BOOLEAN NOT NULL DEFAULT 1,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "LongGoalEntry" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "goalId"    TEXT NOT NULL,
    "date"      DATETIME NOT NULL,
    "value"     REAL NOT NULL,
    "notes"     TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LongGoalEntry_goalId_fkey"
      FOREIGN KEY ("goalId") REFERENCES "LongGoal"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE INDEX IF NOT EXISTS "LongGoalEntry_goalId_idx" ON "LongGoalEntry"("goalId");
  CREATE INDEX IF NOT EXISTS "LongGoalEntry_date_idx"   ON "LongGoalEntry"("date");

  CREATE TABLE IF NOT EXISTS "SavedMeal" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "name"      TEXT NOT NULL,
    "mealType"  TEXT NOT NULL,
    "calories"  INTEGER NOT NULL,
    "protein"   REAL,
    "carbs"     REAL,
    "fat"       REAL,
    "useCount"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "SavedMeal_mealType_idx" ON "SavedMeal"("mealType");

  CREATE TABLE IF NOT EXISTS "AlcoholEntry" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "date"      DATETIME NOT NULL,
    "drinkType" TEXT NOT NULL,
    "quantity"  REAL NOT NULL,
    "units"     REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "AlcoholEntry_date_idx" ON "AlcoholEntry"("date");

  CREATE TABLE IF NOT EXISTS "BowelEntry" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "date"         DATETIME NOT NULL,
    "time"         DATETIME NOT NULL,
    "bristolScale" INTEGER NOT NULL,
    "notes"        TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS "BowelEntry_date_idx" ON "BowelEntry"("date");
`)

// Add columns that might be missing from older schema versions (safe no-ops if they exist)
const safeAddColumn = (table, column, type, dflt) => {
  try {
    const suffix = dflt !== undefined ? ` DEFAULT ${dflt}` : ""
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}${suffix}`)
    console.log(`[init-db] Added ${table}.${column}`)
  } catch {
    // Column already exists
  }
}

safeAddColumn("RunEntry", "environment", "TEXT NOT NULL", "'outdoor'")

db.close()
console.log(`[init-db] Database ready at ${dbPath}`)
