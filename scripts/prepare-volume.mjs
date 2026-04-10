#!/usr/bin/env node
/**
 * When DATA_DIR or DATABASE_PATH points at a persistent volume, store journal uploads there
 * instead of the container filesystem (which is ephemeral on Railway).
 * Symlinks public/.../uploads/journal → $DATA_ROOT/uploads/journal so /uploads/journal/* URLs keep working.
 */
import fs from "node:fs"
import path from "node:path"

function dataRoot() {
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
    const resolved = path.resolve(f)
    return path.dirname(resolved)
  }
  return null
}

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

const root = dataRoot()
if (!root) {
  console.log("[prepare-volume] No DATA_DIR/DATABASE_PATH — uploads stay under public/")
  process.exit(0)
}

const target = path.join(root, "uploads", "journal")
fs.mkdirSync(target, { recursive: true })

for (const publicDir of findPublicDirs()) {
  const uploadsParent = path.join(publicDir, "uploads")
  const linkPath = path.join(uploadsParent, "journal")
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
