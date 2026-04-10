/**
 * Same rules as src/lib/db-path.ts (kept in sync for ESM init script).
 */
import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function resolveSqliteFilePath() {
  const raw = process.env.DATABASE_PATH ?? process.env.DATA_DIR
  if (!raw) {
    return path.join(REPO_ROOT, "prisma", "dev.db")
  }

  let s = raw.trim()
  if (s.startsWith("file:")) {
    s = s.slice(5)
  }
  s = s.replace(/\/+$/, "")

  const resolved = path.resolve(s)

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return path.join(resolved, "thegrid.db")
  }

  const base = path.basename(resolved)
  const looksLikeFile = /\.(db|sqlite|sqlite3)$/i.test(base)
  if (!looksLikeFile) {
    return path.join(resolved, "thegrid.db")
  }

  return resolved
}
