import "server-only"

import fs from "node:fs"
import path from "node:path"

/**
 * Same rules as scripts/resolve-uploads-path.mjs (keep in sync).
 */

function legacyDataRoot(): string | null {
  const dir = process.env.DATA_DIR?.trim()
  if (dir) return dir.replace(/\/+$/, "")

  const p = process.env.DATABASE_PATH?.trim()
  if (p) {
    const s = p.replace(/^file:/, "").replace(/\/+$/, "")
    const resolved = path.resolve(s)
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        return resolved
      }
    } catch {
      /* ignore */
    }
    return path.dirname(resolved)
  }

  const url = process.env.DATABASE_URL?.trim()
  if (url?.startsWith("file:")) {
    const f = url.slice(5).trim()
    return path.dirname(path.resolve(f))
  }

  return null
}

/**
 * Absolute directory for journal image files.
 * - UPLOADS_PATH=/app/uploads → .../app/uploads/journal
 * - Else legacy data root → <root>/uploads/journal
 * - Else local dev → public/uploads/journal under cwd
 */
export function getJournalUploadDir(): string {
  const raw = process.env.UPLOADS_PATH?.trim()
  if (raw) {
    const base = path.resolve(raw.replace(/^file:/, "").replace(/\/+$/, ""))
    return path.join(base, "journal")
  }

  const root = legacyDataRoot()
  if (root) return path.join(root, "uploads", "journal")

  return path.join(process.cwd(), "public", "uploads", "journal")
}
