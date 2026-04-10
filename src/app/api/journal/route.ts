import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  parseYyyyMmDdToStoredDate,
  utcRangeWhereForCalendarDay,
} from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import { getJournalUploadDir } from "@/lib/uploads-path"
import fs from "node:fs"
import path from "node:path"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get("date")
  const monthParam = searchParams.get("month")

  try {
    let where = {}

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      where = { date: utcRangeWhereForCalendarDay(dateParam) }
    } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number)
      const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0))
      const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999))
      where = { date: { gte: start, lte: end } }
    }

    const entries = await prisma.journalEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      },
    })
    return NextResponse.json(entries)
  } catch (e) {
    console.error("[journal GET]", e)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      { error: dev && e instanceof Error ? e.message : "Failed to fetch" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const dateStr = typeof body.date === "string" ? body.date.trim() : ""
    if (!dateStr) {
      return NextResponse.json({ error: "Date is required." }, { status: 400 })
    }

    const date = parseYyyyMmDdToStoredDate(dateStr)
    const content =
      typeof body.content === "string" ? body.content : ""
    const mood =
      typeof body.mood === "number" && body.mood >= 1 && body.mood <= 5
        ? body.mood
        : null
    const images = Array.isArray(body.images)
      ? JSON.stringify(body.images)
      : "[]"
    const attachedStats =
      body.attachedStats && typeof body.attachedStats === "object"
        ? JSON.stringify(body.attachedStats)
        : "{}"

    const entry = await prisma.journalEntry.create({
      data: { date, content, mood, images, attachedStats, userId },
      include: {
        user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      },
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[journal POST]", e)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      {
        error:
          dev && e instanceof Error
            ? e.message
            : "Failed to create entry.",
      },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const id = typeof body.id === "string" ? body.id.trim() : ""
    if (!id) {
      return NextResponse.json({ error: "Entry id is required." }, { status: 400 })
    }

    const existing = await prisma.journalEntry.findFirst({ where: { id, userId } })
    if (!existing) {
      return NextResponse.json({ error: "Not found or not your post." }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    if (typeof body.content === "string") updateData.content = body.content
    if (typeof body.mood === "number" && body.mood >= 1 && body.mood <= 5) {
      updateData.mood = body.mood
    } else if (body.mood === null) {
      updateData.mood = null
    }
    if (Array.isArray(body.images)) {
      updateData.images = JSON.stringify(body.images)
    }
    if (body.attachedStats && typeof body.attachedStats === "object") {
      updateData.attachedStats = JSON.stringify(body.attachedStats)
    }
    if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      updateData.date = parseYyyyMmDdToStoredDate(body.date)
    }

    const entry = await prisma.journalEntry.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      },
    })
    return NextResponse.json(entry)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[journal PUT]", e)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      {
        error:
          dev && e instanceof Error
            ? e.message
            : "Failed to update entry.",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "ID required." }, { status: 400 })
    }

    const entry = await prisma.journalEntry.findFirst({ where: { id, userId } })
    if (!entry) {
      return NextResponse.json({ error: "Not found or not your post." }, { status: 404 })
    }

    const images: string[] = JSON.parse(entry.images || "[]")
    const journalDir = getJournalUploadDir()
    for (const imgUrl of images) {
      if (imgUrl.startsWith("/uploads/journal/")) {
        const name = path.basename(imgUrl)
        if (name.includes("..") || name.includes("/")) continue
        const filePath = path.join(journalDir, name)
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        } catch {}
      }
    }

    await prisma.journalEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[journal DELETE]", e)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      {
        error:
          dev && e instanceof Error
            ? e.message
            : "Failed to delete.",
      },
      { status: 500 }
    )
  }
}
