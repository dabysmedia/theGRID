import "dotenv/config"
import path from "node:path"
import fs from "node:fs"
import { defineConfig } from "prisma/config"

/** Same rules as src/lib/db-path.ts (Prisma CLI cannot import app code reliably). */
function resolveSqliteFilePathForPrisma(): string {
  const raw = process.env["DATABASE_PATH"] ?? process.env["DATA_DIR"]
  if (!raw) {
    return path.resolve(__dirname, "prisma", "dev.db")
  }
  let s = raw.trim()
  if (s.startsWith("file:")) s = s.slice(5)
  s = s.replace(/\/+$/, "")
  const resolved = path.resolve(s)
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return path.join(resolved, "thegrid.db")
  }
  const base = path.basename(resolved)
  const looksLikeFile = /\.(db|sqlite|sqlite3)$/i.test(base)
  if (!looksLikeFile) {
    return path.join(resolved, "thegrid.db")
  }
  return resolved
}

function resolveDbUrl(): string {
  if (process.env["DATABASE_URL"]) return process.env["DATABASE_URL"]
  return `file:${resolveSqliteFilePathForPrisma()}`
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDbUrl(),
  },
})
