import path from "node:path"
import fs from "node:fs"

/**
 * Resolves the SQLite file path for production (Railway volume) and local dev.
 *
 * - If DATABASE_PATH points at a directory (e.g. `/data` mount), uses `thegrid.db` inside it.
 * - Strips Prisma-style `file:` prefixes if someone pastes DATABASE_URL by mistake.
 * - DATA_DIR and RAILWAY_VOLUME_MOUNT_PATH are supported aliases.
 */
export function resolveSqliteFilePath(): string {
  const raw =
    process.env.DATABASE_PATH ??
    process.env.DATA_DIR ??
    process.env.RAILWAY_VOLUME_MOUNT_PATH
  if (!raw) {
    return path.resolve(process.cwd(), "prisma", "dev.db")
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
