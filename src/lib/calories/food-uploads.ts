import "server-only"

import fs from "node:fs"
import path from "node:path"
import { getUploadSegmentDir } from "@/lib/uploads-path"

export const FOOD_UPLOAD_URL_PREFIX = "/uploads/food/"
export const MAX_FOOD_IMAGE_BYTES = 6 * 1024 * 1024
export const ALLOWED_FOOD_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

function sanitizeIdSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)
}

export function foodImageExtension(mime: string): string {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  return "jpg"
}

export function getFoodUploadDirForUser(userId: string): string {
  return path.join(getUploadSegmentDir("food"), sanitizeIdSegment(userId))
}

export function resolveFoodUploadPath({
  url,
  userId,
}: {
  url: string
  userId: string
}): string | null {
  if (!url.startsWith(FOOD_UPLOAD_URL_PREFIX)) return null
  const parts = url.slice(FOOD_UPLOAD_URL_PREFIX.length).split("/")
  if (parts.length !== 2) return null
  const [userPart, filename] = parts
  if (
    userPart !== sanitizeIdSegment(userId) ||
    !filename ||
    filename !== path.basename(filename) ||
    filename.includes("..")
  ) {
    return null
  }
  const filePath = path.join(getFoodUploadDirForUser(userId), filename)
  return fs.existsSync(filePath) ? filePath : null
}
