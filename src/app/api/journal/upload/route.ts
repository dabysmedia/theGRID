import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { detectJournalImage, safeJournalStoragePath } from "@/lib/journal-photo"
import { journalPhotoIdFromUrl } from "@/lib/journal"
import { getJournalUploadDir } from "@/lib/uploads-path"

const MAX_SIZE_BYTES = 10 * 1024 * 1024

function userStoragePrefix(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 24)
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const formData = await req.formData()
    const file = formData.get("file")

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Photos must be smaller than 10 MB." }, { status: 400 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const detected = detectJournalImage(bytes)
    if (!detected) {
      return NextResponse.json(
        { error: "Use a valid JPEG, PNG, WebP, or GIF photo." },
        { status: 400 },
      )
    }

    const storageKey = `${userStoragePrefix(userId)}/${randomUUID()}.${detected.ext}`
    const uploadRoot = getJournalUploadDir()
    const filePath = safeJournalStoragePath(uploadRoot, storageKey)
    if (!filePath) {
      return NextResponse.json({ error: "Could not prepare a safe upload path." }, { status: 500 })
    }

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, bytes, { flag: "wx" })

    try {
      const photo = await prisma.journalPhoto.create({
        data: {
          storageKey,
          mimeType: detected.mime,
          byteSize: bytes.byteLength,
          userId,
        },
        select: { id: true },
      })
      return NextResponse.json(
        { id: photo.id, url: `/uploads/journal/${photo.id}` },
        { status: 201 },
      )
    } catch (error) {
      await fs.promises.unlink(filePath).catch(() => {})
      throw error
    }
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[journal/upload POST]", error)
    return NextResponse.json({ error: "Photo upload failed. Please try again." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const url = new URL(req.url).searchParams.get("url") ?? ""
    const id = journalPhotoIdFromUrl(url)
    if (!id) return NextResponse.json({ error: "Invalid photo reference." }, { status: 400 })

    const photo = await prisma.journalPhoto.findFirst({
      where: { id, userId, journalEntryId: null },
      select: { id: true, storageKey: true },
    })
    if (!photo) {
      return NextResponse.json({ error: "Photo not found or already attached." }, { status: 404 })
    }

    await prisma.journalPhoto.delete({ where: { id: photo.id } })
    const filePath = safeJournalStoragePath(getJournalUploadDir(), photo.storageKey)
    if (filePath) await fs.promises.unlink(filePath).catch(() => {})
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UserError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[journal/upload DELETE]", error)
    return NextResponse.json({ error: "Could not remove the photo." }, { status: 500 })
  }
}
