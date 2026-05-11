import "server-only"

import fs from "node:fs"
import path from "node:path"
import { getUploadSegmentDir } from "@/lib/uploads-path"

/** Web-served prefix for coach attachments (matches getCoachUploadDir on disk). */
export const COACH_UPLOAD_URL_PREFIX = "/uploads/coach/"

/** Disk directory shared by all coach attachments. Uses the same UPLOADS_PATH rules as journal/avatars. */
export function getCoachUploadDir(): string {
  return getUploadSegmentDir("coach")
}

/** Per-user subdirectory for chat image attachments. */
export function getCoachUploadDirForUser(userId: string): string {
  const safeUser = sanitizeIdSegment(userId)
  return path.join(getCoachUploadDir(), safeUser)
}

export const ALLOWED_COACH_IMAGE_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

export const MAX_COACH_IMAGE_BYTES = 6 * 1024 * 1024 // 6 MB

export function extFromCoachMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    default:
      return "jpg"
  }
}

export function mimeFromCoachExt(ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase()
  switch (e) {
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    default:
      return "image/jpeg"
  }
}

/**
 * Resolve a `/uploads/coach/<userId>/<filename>` URL to a server file path,
 * verifying ownership and rejecting path-traversal attempts. Returns null if
 * the path is malformed or doesn't belong to the requesting user.
 */
export function resolveCoachUploadPath(opts: {
  url: string
  userId: string
}): { absPath: string; mime: string; filename: string } | null {
  if (typeof opts.url !== "string" || !opts.url.startsWith(COACH_UPLOAD_URL_PREFIX)) {
    return null
  }
  const rest = opts.url.slice(COACH_UPLOAD_URL_PREFIX.length)
  const parts = rest.split("/")
  if (parts.length !== 2) return null
  const [userPart, filename] = parts
  if (!userPart || !filename) return null
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return null

  const sanitizedUser = sanitizeIdSegment(opts.userId)
  if (userPart !== sanitizedUser) return null

  const ext = path.extname(filename).slice(1).toLowerCase()
  if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return null

  const absPath = path.join(getCoachUploadDirForUser(opts.userId), filename)
  if (!fs.existsSync(absPath)) return null
  return { absPath, mime: mimeFromCoachExt(ext), filename }
}

export function readCoachUploadBase64(absPath: string): string {
  const buf = fs.readFileSync(absPath)
  return buf.toString("base64")
}

/**
 * Best-effort cleanup of all images attached to a conversation. Errors are
 * swallowed so a partial cleanup never blocks DB deletion.
 */
export function deleteCoachUploadsByUrls(urls: string[], userId: string): void {
  for (const url of urls) {
    const resolved = resolveCoachUploadPath({ url, userId })
    if (!resolved) continue
    try {
      fs.unlinkSync(resolved.absPath)
    } catch {
      /* ignore */
    }
  }
}

/** Strip anything that is not safe inside a directory name (cuid is already safe; defensive). */
function sanitizeIdSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)
}
