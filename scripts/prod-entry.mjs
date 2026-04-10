#!/usr/bin/env node
/**
 * Production boot: force SQLite URL when using a volume, symlink uploads, sync schema, bootstrap Carlos, then start Next.
 * Used by `npm start` (Railway Nixpacks) and Docker CMD.
 */
import { spawn } from "node:child_process"
import { execSync } from "node:child_process"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveSqliteFilePath } from "./resolve-db-path.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const env = { ...process.env }
if (env.DATABASE_PATH?.trim() || env.DATA_DIR?.trim()) {
  env.DATABASE_URL = `file:${resolveSqliteFilePath()}`
}

function runNode(rel) {
  execSync(`node "${join(root, rel)}"`, { env, cwd: root, stdio: "inherit" })
}

runNode("scripts/prepare-volume.mjs")
execSync("npx prisma db push", { env, cwd: root, stdio: "inherit" })
runNode("scripts/ensure-default-user.mjs")

const child = spawn(process.execPath, [join(root, "scripts", "start.mjs")], {
  stdio: "inherit",
  cwd: root,
  env,
})
child.on("exit", (code) => process.exit(code ?? 0))
