import "server-only"

import { PrismaClient } from "@/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import path from "node:path"
import fs from "node:fs"
import { resolveSqliteFilePath } from "@/lib/db-path"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function resolveDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  return `file:${resolveSqliteFilePath()}`
}

function createPrismaClient() {
  const url = resolveDbUrl()
  const filePath = url.startsWith("file:") ? url.slice(5) : url
  const resolved = path.resolve(filePath)
  const dir = path.dirname(resolved)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const adapter = new PrismaBetterSqlite3({ url })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
