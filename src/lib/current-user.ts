import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPin, isLegacyPlainPin } from "@/lib/pin"

export const DEFAULT_USER_ID = "carlos"
const USER_ID_HEADER = "x-user-id"
const USER_ID_COOKIE = "thegrid_user_id"
let ownershipBackfillPromise: Promise<void> | null = null

async function backfillAllDataToCarlos(userId: string) {
  if (ownershipBackfillPromise) return ownershipBackfillPromise

  ownershipBackfillPromise = (async () => {
    const escapedUserId = userId.replace(/'/g, "''")
    const sql = [
      `UPDATE "CalorieEntry" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "StepEntry" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "RunEntry" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "WorkoutEntry" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "WorkoutTemplate" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "WorkoutSession" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "SleepEntry" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "Goal" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "LongGoal" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "Habit" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "SavedMeal" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "AlcoholEntry" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "BowelEntry" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "JournalEntry" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
      `UPDATE "JournalImageUpload" SET "userId"='${escapedUserId}' WHERE "userId" IS NULL;`,
    ].join("\n")
    await prisma.$executeRawUnsafe(sql)
  })().catch((err) => {
    ownershipBackfillPromise = null
    throw err
  })

  return ownershipBackfillPromise
}

export async function ensureDefaultUser() {
  const existing = await prisma.user.findUnique({ where: { id: DEFAULT_USER_ID } })
  if (existing) {
    if (isLegacyPlainPin(existing.pinHash)) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { pinHash: hashPin(existing.pinHash) },
      })
      await backfillAllDataToCarlos(updated.id)
      return updated
    }
    await backfillAllDataToCarlos(existing.id)
    return existing
  }

  const byName = await prisma.user.findUnique({ where: { name: "Carlos" } })
  if (byName) {
    if (isLegacyPlainPin(byName.pinHash)) {
      const updated = await prisma.user.update({
        where: { id: byName.id },
        data: { pinHash: hashPin(byName.pinHash) },
      })
      await backfillAllDataToCarlos(updated.id)
      return updated
    }
    await backfillAllDataToCarlos(byName.id)
    return byName
  }

  const created = await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {
      name: "Carlos",
      avatarColor: "#22c55e",
    },
    create: {
      id: DEFAULT_USER_ID,
      name: "Carlos",
      pinHash: hashPin("0000"),
      avatarColor: "#22c55e",
    },
  })
  await backfillAllDataToCarlos(created.id)
  return created
}

export async function getActiveUserId(req: NextRequest): Promise<string> {
  const headerId = req.headers.get(USER_ID_HEADER)?.trim()
  if (headerId) {
    const user = await prisma.user.findUnique({ where: { id: headerId } })
    if (user) return user.id
  }

  const cookieId = req.cookies.get(USER_ID_COOKIE)?.value?.trim()
  if (cookieId) {
    const user = await prisma.user.findUnique({ where: { id: cookieId } })
    if (user) return user.id
  }

  const user = await ensureDefaultUser()
  return user.id
}

export function getActiveUserIdFromHeaderOnly(req: NextRequest): string | null {
  const headerId = req.headers.get(USER_ID_HEADER)?.trim()
  return headerId || null
}

