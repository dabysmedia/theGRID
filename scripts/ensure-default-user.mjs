#!/usr/bin/env node
/**
 * After prisma db push on a fresh volume: ensure at least one profile exists so the app is usable.
 * Creates Carlos with PIN 1234 (scrypt format matching src/lib/pin-hash.ts) if User table is empty.
 */
import { scryptSync, randomBytes } from "node:crypto"
import Database from "better-sqlite3"
import fs from "node:fs"
import { resolveSqliteFilePath } from "./resolve-db-path.mjs"

function hashPin(pin) {
  const salt = randomBytes(16).toString("hex")
  const derived = scryptSync(pin, salt, 32).toString("hex")
  return `scrypt$${salt}$${derived}`
}

const dbPath = resolveSqliteFilePath()
if (!fs.existsSync(dbPath)) {
  console.warn("[ensure-default-user] Database file missing yet, skipping:", dbPath)
  process.exit(0)
}

const db = new Database(dbPath)

let hasUserTable = false
try {
  const row = db
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='User' LIMIT 1`
    )
    .get()
  hasUserTable = !!row
} catch {
  hasUserTable = false
}

if (!hasUserTable) {
  console.warn("[ensure-default-user] No User table — run prisma db push first")
  db.close()
  process.exit(0)
}

const { c: count } = db.prepare("SELECT COUNT(*) as c FROM User").get()
if (count === 0) {
  const id = "carlos"
  const pinHash = hashPin("1234")
  db.prepare(
    `INSERT INTO "User" ("id", "name", "pinHash", "avatarColor", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(id, "Carlos", pinHash, "#22c55e")
  console.log("[ensure-default-user] Created default profile Carlos (PIN: 1234)")
} else {
  console.log("[ensure-default-user] Users already exist, keeping existing profiles")
}

const userColumns = new Set(db.prepare(`PRAGMA table_info("User")`).all().map((row) => row.name))
if (
  userColumns.has("workCycleEnabled") &&
  userColumns.has("workCycleAnchorDate") &&
  userColumns.has("workCycleLength") &&
  userColumns.has("workCyclePatternJson") &&
  userColumns.has("workoutGoalPerCycle")
) {
  const pattern = JSON.stringify(["day", "day", "night", "night", "off", "off", "off", "off"])
  const result = db.prepare(
    `UPDATE "User"
     SET "workCycleEnabled" = 1,
         "workCycleAnchorDate" = '2026-07-15',
         "workCycleLength" = 8,
         "workCyclePatternJson" = ?,
         "workoutGoalPerCycle" = 3,
         "updatedAt" = datetime('now')
     WHERE (
       lower("name") = 'carlos'
       OR "id" = 'carlos'
       OR (SELECT COUNT(*) FROM "User") = 1
     ) AND "workCycleAnchorDate" IS NULL`
  ).run(pattern)
  if (result.changes > 0) {
    console.log("[ensure-default-user] Configured Carlos's 8-day work rotation")
  }
}

db.close()
