import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { getRoutineCoversUploadDir } from "@/lib/uploads-path"
import { resolveUserId, UserError } from "@/lib/current-user"

const MAX_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

const ROUTINE_COVER_PREFIX = "/uploads/routine-covers/"

function ensureUploadDir() {
  const dir = getRoutineCoversUploadDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }
  return map[mime] ?? "jpg"
}

export async function POST(req: NextRequest) {
  try {
    await resolveUserId(req)
    const formData = await req.formData()
    const file = formData.get("file")

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided." }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, and WebP images are allowed." },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 8 MB." },
        { status: 400 }
      )
    }

    ensureUploadDir()
    const ext = extFromMime(file.type)
    const filename = `${randomUUID()}.${ext}`
    const filePath = path.join(getRoutineCoversUploadDir(), filename)
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    return NextResponse.json({ url: `${ROUTINE_COVER_PREFIX}${filename}` }, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[workout-templates/cover POST]", e)
    return NextResponse.json({ error: "Upload failed." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await resolveUserId(req)
    const url = new URL(req.url).searchParams.get("url")
    if (!url || !url.startsWith(ROUTINE_COVER_PREFIX)) {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 })
    }
    const filename = path.basename(url)
    if (filename.includes("..") || filename.includes("/")) {
      return NextResponse.json({ error: "Invalid filename." }, { status: 400 })
    }
    const filePath = path.join(getRoutineCoversUploadDir(), filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[workout-templates/cover DELETE]", e)
    return NextResponse.json({ error: "Failed to delete file." }, { status: 500 })
  }
}
