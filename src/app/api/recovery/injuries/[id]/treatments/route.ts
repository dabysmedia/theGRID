import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { isKnownTreatmentKey } from "@/lib/recovery-catalog"

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveUserId(req)
    const { id: injuryId } = await ctx.params
    const injury = await prisma.injuryRecord.findFirst({ where: { id: injuryId, userId } })
    if (!injury) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const treatments = await prisma.treatmentLog.findMany({
      where: { injuryId, userId },
      orderBy: { date: "desc" },
    })
    return NextResponse.json(treatments)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await resolveUserId(req)
    const { id: injuryId } = await ctx.params
    const injury = await prisma.injuryRecord.findFirst({ where: { id: injuryId, userId } })
    if (!injury) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await req.json()
    const treatmentKey = String(body.treatmentKey || "")
    if (!isKnownTreatmentKey(treatmentKey)) {
      return NextResponse.json({ error: "Unknown treatment" }, { status: 400 })
    }
    const dateStr = String(body.date || "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 })
    }
    const notes = body.notes != null ? String(body.notes).slice(0, 2000) : null
    const completed = Boolean(body.completed)

    const log = await prisma.treatmentLog.create({
      data: {
        injuryId,
        date: parseYyyyMmDdToStoredDate(dateStr),
        treatmentKey,
        notes,
        completed,
        userId,
      },
    })
    return NextResponse.json(log, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}
