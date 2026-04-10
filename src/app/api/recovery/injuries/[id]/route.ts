import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { normalizeBodySegmentKeysJson } from "@/lib/anatomy-health/derive-from-recovery"

const SEVERITY = new Set(["mild", "moderate", "severe"])
const STATUS = new Set(["active", "improving", "recovered"])

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveUserId(req)
    const { id } = await ctx.params
    const body = await req.json()

    const existing = await prisma.injuryRecord.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const data: Prisma.InjuryRecordUncheckedUpdateInput = {}
    if (body.severity != null && SEVERITY.has(String(body.severity))) data.severity = String(body.severity)
    if (body.status != null && STATUS.has(String(body.status))) data.status = String(body.status)
    if (body.notes != null) data.notes = String(body.notes).slice(0, 4000)
    if (body.bodyRegion !== undefined) {
      data.bodyRegion = body.bodyRegion == null ? null : String(body.bodyRegion).slice(0, 120)
    }
    const segmentJson =
      body.bodySegmentKeys !== undefined ? normalizeBodySegmentKeysJson(body.bodySegmentKeys) : undefined
    if (body.customLabel !== undefined && existing.conditionKey === "custom") {
      data.customLabel = String(body.customLabel || "").slice(0, 200) || "Custom"
    }
    if (body.onsetDate != null && /^\d{4}-\d{2}-\d{2}$/.test(String(body.onsetDate))) {
      data.onsetDate = parseYyyyMmDdToStoredDate(String(body.onsetDate))
    }
    if (body.resolvedAt === null) {
      data.resolvedAt = null
    } else if (body.resolvedAt != null && /^\d{4}-\d{2}-\d{2}$/.test(String(body.resolvedAt))) {
      data.resolvedAt = parseYyyyMmDdToStoredDate(String(body.resolvedAt))
    }

    const hasScalarPatch = Object.keys(data).length > 0
    if (!hasScalarPatch && segmentJson === undefined) {
      const full = await prisma.injuryRecord.findUnique({
        where: { id },
        include: { treatments: { orderBy: { date: "desc" } } },
      })
      return NextResponse.json(full)
    }

    await prisma.$transaction(async (tx) => {
      if (hasScalarPatch) {
        await tx.injuryRecord.update({ where: { id }, data })
      }
      if (segmentJson !== undefined) {
        await tx.$executeRawUnsafe(
          `UPDATE "InjuryRecord" SET "bodySegmentKeysJson" = ?, "updatedAt" = datetime('now') WHERE "id" = ? AND "userId" = ?`,
          segmentJson,
          id,
          userId,
        )
      }
    })
    const full = await prisma.injuryRecord.findUnique({
      where: { id },
      include: { treatments: { orderBy: { date: "desc" } } },
    })
    return NextResponse.json(full)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveUserId(req)
    const { id } = await ctx.params
    const { count } = await prisma.injuryRecord.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
