import fs from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  parseYyyyMmDdToStoredDate,
  utcRangeWhereForCalendarDay,
} from "@/lib/dateStorage"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  journalPhotoIdFromUrl,
  JournalValidationError,
  normalizeJournalPayload,
} from "@/lib/journal"
import { safeJournalStoragePath } from "@/lib/journal-photo"
import { getJournalUploadDir } from "@/lib/uploads-path"

const PAGE_SIZE = 24
const userSelect = { id: true, name: true, avatarColor: true, avatarUrl: true } as const

function parseImages(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []
  } catch {
    return []
  }
}

async function validateOwnedPhotos({
  userId,
  images,
  entryId,
  legacyImages = [],
}: {
  userId: string
  images: string[]
  entryId?: string
  legacyImages?: string[]
}): Promise<string[]> {
  const ids: string[] = []
  const allowedLegacy = new Set(legacyImages)
  for (const url of images) {
    const id = journalPhotoIdFromUrl(url)
    if (id) ids.push(id)
    else if (!allowedLegacy.has(url)) {
      throw new JournalValidationError("One or more photos do not belong to this profile.")
    }
  }

  if (ids.length === 0) return []
  const photos = await prisma.journalPhoto.findMany({
    where: {
      id: { in: ids },
      userId,
      OR: [{ journalEntryId: null }, ...(entryId ? [{ journalEntryId: entryId }] : [])],
    },
    select: { id: true },
  })
  if (photos.length !== new Set(ids).size) {
    throw new JournalValidationError("One or more photos do not belong to this profile.")
  }
  return ids
}

async function removeStoredFiles(storageKeys: string[]): Promise<void> {
  const root = getJournalUploadDir()
  await Promise.all(
    storageKeys.map(async (storageKey) => {
      const filePath = safeJournalStoragePath(root, storageKey)
      if (filePath) await fs.promises.unlink(filePath).catch(() => {})
    }),
  )
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get("date")
    const monthParam = searchParams.get("month")
    const cursor = searchParams.get("cursor")
    const mineOnly = searchParams.get("scope") === "mine"

    const where: Record<string, unknown> = mineOnly ? { userId } : { userId: { not: null } }
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      where.date = utcRangeWhereForCalendarDay(dateParam)
    } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [year, month] = monthParam.split("-").map(Number)
      where.date = {
        gte: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
        lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
      }
    }

    const entries = await prisma.journalEntry.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: userSelect } },
    })
    const hasMore = entries.length > PAGE_SIZE
    const items = hasMore ? entries.slice(0, PAGE_SIZE) : entries
    return NextResponse.json({
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[journal GET]", error)
    return NextResponse.json({ error: "Could not load the progress timeline." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const payload = normalizeJournalPayload(await req.json())
    const photoIds = await validateOwnedPhotos({ userId, images: payload.images })

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.journalEntry.create({
        data: {
          date: parseYyyyMmDdToStoredDate(payload.date),
          content: payload.content,
          mood: payload.mood,
          images: JSON.stringify(payload.images),
          attachedStats: JSON.stringify(payload.attachedStats),
          userId,
        },
      })
      if (photoIds.length > 0) {
        const attached = await tx.journalPhoto.updateMany({
          where: { id: { in: photoIds }, userId, journalEntryId: null },
          data: { journalEntryId: created.id },
        })
        if (attached.count !== photoIds.length) {
          throw new JournalValidationError("A photo was already used by another post.")
        }
      }
      return tx.journalEntry.findUniqueOrThrow({
        where: { id: created.id },
        include: { user: { select: userSelect } },
      })
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof JournalValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[journal POST]", error)
    return NextResponse.json({ error: "Could not publish the progress update." }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const id = typeof body.id === "string" ? body.id.trim() : ""
    if (!id) return NextResponse.json({ error: "Post id is required." }, { status: 400 })

    const existing = await prisma.journalEntry.findFirst({
      where: { id, userId },
      include: { photos: { select: { id: true, storageKey: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: "Post not found or not owned by this profile." }, { status: 404 })
    }

    const payload = normalizeJournalPayload(body)
    const legacyImages = parseImages(existing.images).filter((url) => !journalPhotoIdFromUrl(url))
    const desiredPhotoIds = await validateOwnedPhotos({
      userId,
      images: payload.images,
      entryId: id,
      legacyImages,
    })
    const desiredSet = new Set(desiredPhotoIds)
    const removedPhotos = existing.photos.filter((photo) => !desiredSet.has(photo.id))

    const entry = await prisma.$transaction(async (tx) => {
      if (desiredPhotoIds.length > 0) {
        await tx.journalPhoto.updateMany({
          where: { id: { in: desiredPhotoIds }, userId, OR: [{ journalEntryId: null }, { journalEntryId: id }] },
          data: { journalEntryId: id },
        })
      }
      if (removedPhotos.length > 0) {
        await tx.journalPhoto.deleteMany({
          where: { id: { in: removedPhotos.map((photo) => photo.id) }, userId, journalEntryId: id },
        })
      }
      return tx.journalEntry.update({
        where: { id },
        data: {
          date: parseYyyyMmDdToStoredDate(payload.date),
          content: payload.content,
          mood: payload.mood,
          images: JSON.stringify(payload.images),
          attachedStats: JSON.stringify(payload.attachedStats),
        },
        include: { user: { select: userSelect } },
      })
    })
    await removeStoredFiles(removedPhotos.map((photo) => photo.storageKey))
    return NextResponse.json(entry)
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof JournalValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[journal PUT]", error)
    return NextResponse.json({ error: "Could not update the progress post." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Post id is required." }, { status: 400 })

    const entry = await prisma.journalEntry.findFirst({
      where: { id, userId },
      include: { photos: { select: { storageKey: true } } },
    })
    if (!entry) {
      return NextResponse.json({ error: "Post not found or not owned by this profile." }, { status: 404 })
    }

    await prisma.journalEntry.delete({ where: { id } })
    await removeStoredFiles(entry.photos.map((photo) => photo.storageKey))

    // Remove authenticated legacy files only when deleting their owning migrated post.
    const legacyDir = getJournalUploadDir()
    for (const imageUrl of parseImages(entry.images)) {
      if (!/^\/uploads\/journal\/[^/]+$/.test(imageUrl) || journalPhotoIdFromUrl(imageUrl)) continue
      const filename = path.basename(imageUrl)
      const filePath = path.join(legacyDir, filename)
      await fs.promises.unlink(filePath).catch(() => {})
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[journal DELETE]", error)
    return NextResponse.json({ error: "Could not delete the progress post." }, { status: 500 })
  }
}
