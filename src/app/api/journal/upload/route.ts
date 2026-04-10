import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getActiveUserId } from "@/lib/current-user"

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

type JournalImageUploadDelegate = {
  create: (args: unknown) => Promise<{ id: string }>
  findFirst: (args: unknown) => Promise<{ mimeType: string; data: Uint8Array } | null>
  deleteMany: (args: unknown) => Promise<{ count: number }>
}

function getJournalImageUploadDelegate(): JournalImageUploadDelegate {
  const delegate = (prisma as unknown as { journalImageUpload?: JournalImageUploadDelegate })
    .journalImageUpload
  if (!delegate) {
    throw new Error(
      "Prisma client is outdated for JournalImageUpload. Run `prisma generate` and restart the server."
    )
  }
  return delegate
}

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

export async function POST(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const formData = await req.formData()
    const file = formData.get("file")

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided." }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, WebP, and GIF images are allowed." },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10 MB." },
        { status: 400 }
      )
    }

    const uploads = getJournalImageUploadDelegate()
    const created = await uploads.create({
      data: {
        userId,
        mimeType: file.type,
        data: Buffer.from(arrayBuffer),
      },
      select: { id: true },
    })

    return NextResponse.json({ url: `/api/journal/upload?id=${created.id}` }, { status: 201 })
  } catch (e) {
    console.error("[journal/upload POST]", e)
    return NextResponse.json({ error: "Upload failed." }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id")?.trim()
    if (!id) {
      return NextResponse.json({ error: "Upload id is required." }, { status: 400 })
    }

    const uploads = getJournalImageUploadDelegate()
    const image = await uploads.findFirst({
      where: { id },
      select: { mimeType: true, data: true },
    })
    if (!image) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 })
    }

    return new NextResponse(Buffer.from(image.data), {
      status: 200,
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    })
  } catch (e) {
    console.error("[journal/upload GET]", e)
    return NextResponse.json({ error: "Failed to fetch image." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getActiveUserId(req)
    const { searchParams } = new URL(req.url)
    const url = searchParams.get("url")
    const uploadId = searchParams.get("id")?.trim() || (url ? extractUploadIdFromUrl(url) : null)
    if (!uploadId) {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 })
    }

    const uploads = getJournalImageUploadDelegate()
    await uploads.deleteMany({ where: { id: uploadId, userId } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[journal/upload DELETE]", e)
    return NextResponse.json({ error: "Failed to delete file." }, { status: 500 })
  }
}
