import "server-only"

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** Repo root — do not use process.cwd() alone; Next/Turbopack may run API routes from another cwd. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

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
    if (!path.isAbsolute(f)) return null
    return path.dirname(path.resolve(f))
  }

  return null
}

/**
 * Persistent upload subdirectory: `journal` | `avatars` | `routine-covers` | `coach`
 * - UPLOADS_PATH=/app/uploads → .../app/uploads/<segment>
 * - Legacy data root → <root>/uploads/<segment>
 * - Local dev → public/uploads/<segment> under repo root
 */
export function getUploadSegmentDir(segment: string): string {
  const raw = process.env.UPLOADS_PATH?.trim()
  if (raw) {
    const base = path.resolve(raw.replace(/^file:/, "").replace(/\/+$/, ""))
    return path.join(base, segment)
  }

  const root = legacyDataRoot()
  if (root) return path.join(root, "uploads", segment)

  return path.join(REPO_ROOT, "public", "uploads", segment)
}

export function getJournalUploadDir(): string {
  return getUploadSegmentDir("journal")
}

export function getAvatarsUploadDir(): string {
  return getUploadSegmentDir("avatars")
}

export function getRoutineCoversUploadDir(): string {
  return getUploadSegmentDir("routine-covers")
}

/**
 * Resolve an on-disk path for a file under uploads/<segment>/….
 * Checks the persistent dir first, then public/uploads (baked-in / pre-volume files).
 */
export function resolveUploadFilePath(segment: string, ...parts: string[]): string | null {
  const primary = path.join(getUploadSegmentDir(segment), ...parts)
  if (fs.existsSync(primary)) return primary

  const legacy = path.join(REPO_ROOT, "public", "uploads", segment, ...parts)
  if (fs.existsSync(legacy)) return legacy

  // Older dev uploads when cwd resolved next to prisma/dev.db
  const prismaUploads = path.join(REPO_ROOT, "prisma", "uploads", segment, ...parts)
  if (fs.existsSync(prismaUploads)) return prismaUploads

  return null
}
