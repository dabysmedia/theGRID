import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { getJournalUploadDir } from "@/lib/uploads-path"

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

function getUploadDir(): string {
  return getJournalUploadDir()
}

function ensureUploadDir() {
  const uploadDir = getUploadDir()
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }
  return map[mime] ?? "jpg"
}

export async function POST(req: NextRequest) {
  try {
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

    ensureUploadDir()

    const ext = extFromMime(file.type)
    const filename = `${randomUUID()}.${ext}`
    const filePath = path.join(getUploadDir(), filename)

    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    return NextResponse.json({ url: `/uploads/journal/${filename}` }, { status: 201 })
  } catch (e) {
    console.error("[journal/upload POST]", e)
    return NextResponse.json({ error: "Upload failed." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get("url")

  if (!url || !url.startsWith("/uploads/journal/")) {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 })
  }

  const filename = path.basename(url)
  // Prevent path traversal
  if (filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "Invalid filename." }, { status: 400 })
  }

  const filePath = path.join(getUploadDir(), filename)
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[journal/upload DELETE]", e)
    return NextResponse.json({ error: "Failed to delete file." }, { status: 500 })
  }
}
