#!/usr/bin/env node
/**
 * Symlink public/.../uploads/journal → persistent journal upload dir so /uploads/journal/* URLs work.
 *
 * Set UPLOADS_PATH to a dedicated volume (e.g. /app/uploads on Railway) — files live in UPLOADS_PATH/journal.
 * Legacy: if only DATA_DIR / DATABASE_PATH is set, uses <dataRoot>/uploads/journal (same as before).
 */
import fs from "node:fs"
import path from "node:path"
import { resolveJournalUploadDir } from "./resolve-uploads-path.mjs"

function findPublicDirs() {
  const cwd = process.cwd()
  return [
    path.join(cwd, "public"),
    path.join(cwd, ".next", "standalone", "public"),
  ].filter((p) => {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  })
}

const target = resolveJournalUploadDir()
if (!target) {
  console.log(
    "[prepare-volume] No UPLOADS_PATH or DATA_DIR/DATABASE_PATH — uploads stay under public/"
  )
  process.exit(0)
}

fs.mkdirSync(target, { recursive: true })

const sub = "journal"
for (const publicDir of findPublicDirs()) {
  const uploadsParent = path.join(publicDir, "uploads")
  const linkPath = path.join(uploadsParent, sub)
  try {
    fs.mkdirSync(uploadsParent, { recursive: true })
  } catch {
    /* ignore */
  }
  try {
    const stat = fs.lstatSync(linkPath)
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(linkPath)
    } else if (stat.isDirectory()) {
      fs.rmSync(linkPath, { recursive: true })
    }
  } catch {
    /* does not exist */
  }
  fs.symlinkSync(target, linkPath, "dir")
  console.log(`[prepare-volume] ${linkPath} → ${target}`)
}
