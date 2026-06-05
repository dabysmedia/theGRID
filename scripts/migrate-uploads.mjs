#!/usr/bin/env node
/**
 * On every boot, copy stranded uploads into the persistent volume before
 * prepare-volume replaces public/uploads/* with symlinks.
 *
 * Sources:
 * - /app/uploads/<segment> — ephemeral path when UPLOADS_PATH pointed at the container FS
 * - public/uploads/<segment> — baked-in or pre-volume files under the app image
 */
import path from "node:path"
import { resolveUploadSegmentDir } from "./resolve-uploads-path.mjs"
import { copyUploadTree, findPublicDirs } from "./copy-upload-tree.mjs"

const OLD_BASE = "/app/uploads"
const SEGMENTS = ["journal", "avatars", "routine-covers", "coach"]

function migrateSegment(segment, src, dest) {
  if (path.resolve(src) === path.resolve(dest)) return null

  const { migrated, skipped, errors } = copyUploadTree(src, dest)
  if (migrated === 0 && skipped === 0 && errors === 0) return null

  return { migrated, skipped, errors, src, dest }
}

for (const segment of SEGMENTS) {
  const dest = resolveUploadSegmentDir(segment)
  if (!dest) continue

  const sources = [path.join(OLD_BASE, segment)]
  for (const publicDir of findPublicDirs()) {
    sources.push(path.join(publicDir, "uploads", segment))
  }

  const seen = new Set()
  for (const src of sources) {
    const key = path.resolve(src)
    if (seen.has(key)) continue
    seen.add(key)

    const result = migrateSegment(segment, src, dest)
    if (!result) continue

    console.log(
      `[migrate-uploads] ${segment}: migrated ${result.migrated} file(s)` +
        (result.skipped > 0 ? `, skipped ${result.skipped} already-present` : "") +
        (result.errors > 0 ? `, ${result.errors} error(s)` : "") +
        ` (${result.src} → ${result.dest})`
    )
  }
}
