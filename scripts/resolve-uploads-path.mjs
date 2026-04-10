/**
 * Persistent upload dirs for prepare-volume symlinks.
 * Keep in sync with src/lib/uploads-path.ts
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
 * @param {"journal" | "avatars"} segment
 * @returns {string | null} Absolute dir on volume, or null if using local-only public/
 */
export function resolveUploadSegmentDir(segment) {
  const raw = process.env.UPLOADS_PATH?.trim()
  if (raw) {
    const base = path.resolve(raw.replace(/^file:/, "").replace(/\/+$/, ""))
    return path.join(base, segment)
  }

  const root = legacyDataRoot()
  if (root) return path.join(root, "uploads", segment)

  return null
}

export function resolveJournalUploadDir() {
  return resolveUploadSegmentDir("journal")
}

export function resolveAvatarsUploadDir() {
  return resolveUploadSegmentDir("avatars")
}
