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
import { resolveSqliteFilePath } from "./resolve-db-path.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function exitChild(code) {
  process.exit(code ?? 0)
}

/**
 * Force DATABASE_URL to the volume SQLite file when DATABASE_PATH / DATA_DIR is set, so the
 * Next child (after chdir) still connects to /data even if Railway set DATABASE_URL to Postgres.
 */
function buildEnv() {
  const hasVolumeHint =
    process.env.DATABASE_PATH?.trim() || process.env.DATA_DIR?.trim()
  if (hasVolumeHint) {
    return {
      ...process.env,
      DATABASE_URL: `file:${resolveSqliteFilePath()}`,
    }
  }
  if (process.env.DATABASE_URL) {
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
