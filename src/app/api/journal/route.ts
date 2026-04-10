import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  parseYyyyMmDdToStoredDate,
  utcRangeWhereForCalendarDay,
} from "@/lib/dateStorage"
import { getActiveUserId } from "@/lib/current-user"

function extractUploadIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "http://localhost")
    if (parsed.pathname !== "/api/journal/upload") return null
    const id = parsed.searchParams.get("id")?.trim()
    return id || null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get("date")
  const monthParam = searchParams.get("month") // YYYY-MM

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
        user: {
          select: { id: true, name: true, avatarColor: true },
        },
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
    const userId = await getActiveUserId(req)
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
      data: { userId, date, content, mood, images, attachedStats },
      include: {
        user: {
          select: { id: true, name: true, avatarColor: true },
        },
      },
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
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
    const userId = await getActiveUserId(req)
    const body = await req.json()
    const id = typeof body.id === "string" ? body.id.trim() : ""
    if (!id) {
      return NextResponse.json({ error: "Entry id is required." }, { status: 400 })
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

    const existing = await prisma.journalEntry.findFirst({
      where: { id, userId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 })
    }

    const entry = await prisma.journalEntry.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        user: {
          select: { id: true, name: true, avatarColor: true },
        },
      },
    })
    return NextResponse.json(entry)
  } catch (e) {
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
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "ID required." }, { status: 400 })
  }

  try {
    const userId = await getActiveUserId(req)
    const entry = await prisma.journalEntry.findFirst({ where: { id, userId } })
    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 })
    }
    if (entry) {
      // Clean up uploaded image blobs for this entry.
      const images: string[] = JSON.parse(entry.images || "[]")
      const uploadIds = images
        .map((imgUrl) => extractUploadIdFromUrl(imgUrl))
        .filter((v): v is string => Boolean(v))

      if (uploadIds.length > 0) {
        await prisma.journalImageUpload.deleteMany({
          where: { id: { in: uploadIds }, userId },
        })
      }
    }

    await prisma.journalEntry.delete({ where: { id: entry.id } })
    return NextResponse.json({ success: true })
  } catch (e) {
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
