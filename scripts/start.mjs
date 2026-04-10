#!/usr/bin/env node
/**
 * Production start: prefer Next.js standalone `server.js` (Docker / outputFileTracing)
 * so `next` CLI is not required. Falls back to `next start` when developing with a full install.
 *
 * SQLite path fix: Next.js standalone `server.js` calls `process.chdir(__dirname)` at line 1
 * which overrides whatever cwd we pass. We therefore inject DATABASE_URL as an absolute path
 * so `src/lib/db-path.ts` finds the correct database file regardless of cwd.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function exitChild(code) {
  process.exit(code ?? 0)
}

/** Absolute path to the primary SQLite database (already synced by `prisma db push`). */
function buildEnv() {
  // Only inject DATABASE_URL when not already set (e.g. PostgreSQL in production cloud).
  if (process.env.DATABASE_URL || process.env.DATABASE_PATH || process.env.DATA_DIR) {
    return process.env
  }
  const dbPath = resolve(root, "prisma", "dev.db")
  return { ...process.env, DATABASE_URL: `file:${dbPath}` }
}

/** Docker / copied standalone: server.js next to package.json */
const dockerStyle = join(root, "server.js")
if (existsSync(dockerStyle)) {
  const child = spawn(process.execPath, [dockerStyle], {
    stdio: "inherit",
    cwd: root,
    env: buildEnv(),
  })
  child.on("exit", exitChild)
} else {
  const standaloneDir = join(root, ".next", "standalone")
  const standaloneServer = join(standaloneDir, "server.js")
  if (existsSync(standaloneServer)) {
    const child = spawn(process.execPath, [standaloneServer], {
      stdio: "inherit",
      cwd: standaloneDir,
      env: buildEnv(),
    })
    child.on("exit", exitChild)
  } else {
    const child = spawn("npx", ["next", "start"], {
      stdio: "inherit",
      cwd: root,
      env: buildEnv(),
      shell: true,
    })
    child.on("exit", exitChild)
  }
}
