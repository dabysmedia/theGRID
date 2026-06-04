import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseYyyyMmDdToStoredDate, utcRangeWhereForCalendarDay } from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { INJECTION_SITE_IDS, normalizeSideEffects } from "@/lib/peptides"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get("date")

    const where: Record<string, unknown> = { userId }
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      where.date = utcRangeWhereForCalendarDay(dateParam)
    }

    const entries = await prisma.peptideEntry.findMany({
      where,
      orderBy: { injectedAt: "desc" },
    })
    return NextResponse.json(entries)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()

    const doseMg = Number(body.doseMg)
    if (!Number.isFinite(doseMg) || doseMg <= 0) {
      return NextResponse.json({ error: "doseMg must be a positive number" }, { status: 400 })
    }

    const injectionSite = String(body.injectionSite ?? "")
    if (!INJECTION_SITE_IDS.has(injectionSite)) {
      return NextResponse.json({ error: "Invalid injection site" }, { status: 400 })
    }

    const injectedAt = body.injectedAt ? new Date(body.injectedAt) : new Date()
    if (Number.isNaN(injectedAt.getTime())) {
      return NextResponse.json({ error: "Invalid injectedAt" }, { status: 400 })
    }

    const compound = String(body.compound ?? "retatrutide")
    const sideEffects = normalizeSideEffects(body.sideEffects)

    const entry = await prisma.peptideEntry.create({
      data: {
        date: parseYyyyMmDdToStoredDate(String(body.date)),
        injectedAt,
        compound,
        doseMg,
        injectionSite,
        sideEffectsJson: JSON.stringify(sideEffects),
        notes: body.notes || null,
        userId,
      },
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const { count } = await prisma.peptideEntry.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
