#!/usr/bin/env node
/**
 * One-time migration: copy any files stranded in the old ephemeral upload path
 * (/app/uploads/journal) to the correct persistent volume path (/data/uploads/journal).
 *
 * Background: UPLOADS_PATH was previously incorrectly set to /app/uploads, causing
 * uploaded images to land on the ephemeral container filesystem. After the fix to
 * /data/uploads, old images became unreachable. This script runs on every boot and
 * copies any remaining files from the old location to the new one so they are recovered.
 */
import fs from "node:fs"
import path from "node:path"
import { resolveUploadSegmentDir } from "./resolve-uploads-path.mjs"

const OLD_BASE = "/app/uploads"
const SEGMENTS = ["journal", "avatars", "routine-covers", "coach"]

for (const segment of SEGMENTS) {
  const src = path.join(OLD_BASE, segment)
  const dest = resolveUploadSegmentDir(segment)

  if (!dest) {
    // No persistent volume configured — nothing to migrate.
    continue
  }

  // Skip if the old location doesn't exist or is already the same path as dest.
  if (path.resolve(src) === path.resolve(dest)) {
    continue
  }

  let entries
  try {
    entries = fs.readdirSync(src)
  } catch {
    // Source directory doesn't exist — nothing to migrate for this segment.
    continue
  }

  if (entries.length === 0) {
    console.log(`[migrate-uploads] ${src} is empty — nothing to migrate.`)
    continue
  }

  fs.mkdirSync(dest, { recursive: true })

  let migrated = 0
  let skipped = 0
  let errors = 0

  for (const entry of entries) {
    const srcFile = path.join(src, entry)
    const destFile = path.join(dest, entry)

    try {
      // Skip if already present at the destination.
      if (fs.existsSync(destFile)) {
        skipped++
        continue
      }

      fs.copyFileSync(srcFile, destFile)
      migrated++
    } catch (err) {
      console.error(`[migrate-uploads] Failed to copy ${srcFile} → ${destFile}: ${err.message}`)
      errors++
    }
  }

  console.log(
    `[migrate-uploads] ${segment}: migrated ${migrated} file(s)` +
      (skipped > 0 ? `, skipped ${skipped} already-present` : "") +
      (errors > 0 ? `, ${errors} error(s)` : "") +
      ` (${src} → ${dest})`
  )
}
