#!/usr/bin/env node
/**
 * Symlink public/.../uploads/* → persistent dirs so /uploads/* URLs work.
 *
 * UPLOADS_PATH=/app/uploads → .../<segment> on the volume.
 * Legacy: DATA_DIR / DATABASE_PATH → <dataRoot>/uploads/<segment>
 */
import fs from "node:fs"
import path from "node:path"
import { resolveUploadSegmentDir } from "./resolve-uploads-path.mjs"
import { copyUploadTree } from "./copy-upload-tree.mjs"

const SEGMENTS = ["journal", "avatars", "routine-covers", "coach"]

function findPublicDirs() {
  const cwd = process.cwd()
  const dirs = [path.join(cwd, "public")]

  const standaloneRoot = path.join(cwd, ".next", "standalone")
  if (fs.existsSync(standaloneRoot)) {
    const standalonePublic = path.join(standaloneRoot, "public")
    fs.mkdirSync(standalonePublic, { recursive: true })
    dirs.push(standalonePublic)
  }

  return dirs.filter((p) => {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  })
}

const firstTarget = resolveUploadSegmentDir("journal")
if (!firstTarget) {
  console.log(
    "[prepare-volume] No UPLOADS_PATH or DATA_DIR/DATABASE_PATH — uploads stay under public/"
  )
  process.exit(0)
}

for (const sub of SEGMENTS) {
  const target = resolveUploadSegmentDir(sub)
  if (!target) continue
  fs.mkdirSync(target, { recursive: true })

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
        const copied = copyUploadTree(linkPath, target)
        if (copied.migrated > 0) {
          console.log(
            `[prepare-volume] copied ${copied.migrated} file(s) from ${linkPath} → ${target} before symlink`
          )
        }
        fs.rmSync(linkPath, { recursive: true })
      }
    } catch {
      /* does not exist */
    }
    fs.symlinkSync(target, linkPath, "dir")
    console.log(`[prepare-volume] ${linkPath} → ${target}`)
  }
}
