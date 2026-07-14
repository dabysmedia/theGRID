import "server-only"

import { PrismaClient } from "@/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import path from "node:path"
import fs from "node:fs"
import { resolveSqliteFilePath } from "@/lib/db-path"

/** Increment when Prisma schema changes require a fresh client (dev HMR keeps `globalThis.prisma` otherwise). */
const PRISMA_CLIENT_CACHE_REV = 11

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaClientCacheRev?: number
}

/**
 * When DATABASE_PATH or DATA_DIR is set (Railway volume at /data), always use that SQLite file.
 * Railway often injects DATABASE_URL for a Postgres plugin — that would ignore the volume and
 * break persistence; SQLite-on-volume deployments must win over a stale DATABASE_URL.
 */
function resolveDbUrl(): string {
  if (process.env.DATABASE_PATH?.trim() || process.env.DATA_DIR?.trim()) {
    return `file:${resolveSqliteFilePath()}`
  }
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

/** After `prisma generate` adds models, dev HMR can keep a stale global client without new delegates. */
function clientHasRecoveryModels(client: PrismaClient): boolean {
  const c = client as unknown as {
    recoveryDailyEntry?: unknown
    injuryRecord?: unknown
    coachConversation?: unknown
    coachMessage?: unknown
    pushSubscription?: unknown
    notificationPreference?: unknown
    fastingProfile?: unknown
    peptideEntry?: unknown
    peptideDailyEntry?: unknown
    googleHealthConnection?: unknown
    vitalDailyEntry?: unknown
    heartRateSample?: unknown
    workoutProgressionSummary?: unknown
  }
  return (
    c.recoveryDailyEntry != null &&
    c.injuryRecord != null &&
    c.coachConversation != null &&
    c.coachMessage != null &&
    c.pushSubscription != null &&
    c.notificationPreference != null &&
    c.fastingProfile != null &&
    c.peptideEntry != null &&
    c.peptideDailyEntry != null &&
    c.googleHealthConnection != null &&
    c.vitalDailyEntry != null &&
    c.heartRateSample != null &&
    c.workoutProgressionSummary != null
  )
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma
  if (
    cached &&
    globalForPrisma.prismaClientCacheRev === PRISMA_CLIENT_CACHE_REV &&
    clientHasRecoveryModels(cached)
  ) {
    return cached
  }
  if (cached) {
    void cached.$disconnect().catch(() => {})
  }
  const fresh = createPrismaClient()
  globalForPrisma.prismaClientCacheRev = PRISMA_CLIENT_CACHE_REV
  globalForPrisma.prisma = fresh
  return fresh
}

export const prisma = getPrismaClient()
