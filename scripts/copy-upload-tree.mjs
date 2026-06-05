import fs from "node:fs"
import path from "node:path"

/**
 * Recursively copy files from src → dest. Skips entries already present at dest.
 * @returns {{ migrated: number, skipped: number, errors: number }}
 */
export function copyUploadTree(src, dest) {
  const result = { migrated: 0, skipped: 0, errors: 0 }
  if (!src || !dest) return result

  let stat
  try {
    stat = fs.lstatSync(src)
  } catch {
    return result
  }

  if (stat.isSymbolicLink()) return result

  if (stat.isFile()) {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      if (fs.existsSync(dest)) {
        result.skipped++
        return result
      }
      fs.copyFileSync(src, dest)
      result.migrated++
    } catch (err) {
      console.error(`[copy-upload-tree] Failed to copy ${src} → ${dest}: ${err.message}`)
      result.errors++
    }
    return result
  }

  if (!stat.isDirectory()) return result

  let entries
  try {
    entries = fs.readdirSync(src, { withFileTypes: true })
  } catch {
    return result
  }

  fs.mkdirSync(dest, { recursive: true })

  for (const entry of entries) {
    const sub = copyUploadTree(path.join(src, entry.name), path.join(dest, entry.name))
    result.migrated += sub.migrated
    result.skipped += sub.skipped
    result.errors += sub.errors
  }

  return result
}

/** public/ dirs that may still hold baked-in uploads before symlinks replace them. */
export function findPublicDirs() {
  const cwd = process.cwd()
  const dirs = [path.join(cwd, "public")]

  const standalonePublic = path.join(cwd, ".next", "standalone", "public")
  try {
    if (fs.existsSync(path.join(cwd, ".next", "standalone"))) {
      fs.mkdirSync(standalonePublic, { recursive: true })
      dirs.push(standalonePublic)
    }
  } catch {
    /* ignore */
  }

  return dirs.filter((p) => {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  })
}
