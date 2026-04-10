/**
 * Journal (and future) uploads directory resolution.
 * Keep in sync with src/lib/uploads-path.ts
 *
 * Priority:
 * 1. UPLOADS_PATH — dedicated volume mount (e.g. Railway volume at /app/uploads → UPLOADS_PATH=/app/uploads → files in .../journal)
 * 2. Legacy: DATA_DIR or DATABASE_PATH → <dataRoot>/uploads/journal
 * 3. null — use repo public/uploads/journal (prepare-volume skips symlink; API uses cwd path)
 */
import fs from "node:fs"
import path from "node:path"

export function legacyDataRoot() {
  const dir = process.env.DATA_DIR?.trim()
  if (dir) return dir.replace(/\/+$/, "")

  const p = process.env.DATABASE_PATH?.trim()
  if (p) {
    let s = p.replace(/^file:/, "").replace(/\/+$/, "")
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
 * @returns {string | null} Absolute journal upload directory on persistent storage, or null for local-only public/
 */
export function resolveJournalUploadDir() {
  const raw = process.env.UPLOADS_PATH?.trim()
  if (raw) {
    let s = raw.replace(/^file:/, "").replace(/\/+$/, "")
    const base = path.resolve(s)
    return path.join(base, "journal")
  }

  const root = legacyDataRoot()
  if (root) return path.join(root, "uploads", "journal")

  return null
}
