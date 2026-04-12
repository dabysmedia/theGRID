import "server-only"

import { prisma } from "@/lib/prisma"

/** True when SQLite/Prisma failed because `User.vacationResumeDate` is not in the DB file yet. */
export function isMissingUserVacationColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /no such column[^\n]*vacationResumeDate/i.test(msg)
}

/** Adds nullable `vacationResumeDate` to `User` if missing (idempotent for SQLite). */
export async function ensureUserVacationColumn(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN "vacationResumeDate" TEXT`
  )
}
