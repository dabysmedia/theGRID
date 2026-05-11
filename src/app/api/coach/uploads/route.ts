import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  ALLOWED_COACH_IMAGE_TYPES,
  COACH_UPLOAD_URL_PREFIX,
  MAX_COACH_IMAGE_BYTES,
  extFromCoachMime,
  getCoachUploadDirForUser,
  resolveCoachUploadPath,
} from "@/lib/coach/uploads"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const formData = await req.formData()
    const file = formData.get("file")
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided." }, { status: 400 })
    }

    if (!ALLOWED_COACH_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, WebP, and GIF images are allowed." },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_COACH_IMAGE_BYTES) {
      const mb = Math.round(MAX_COACH_IMAGE_BYTES / 1024 / 1024)
      return NextResponse.json(
        { error: `File too large. Maximum size is ${mb} MB.` },
        { status: 400 }
      )
    }

    const dir = getCoachUploadDirForUser(userId)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const ext = extFromCoachMime(file.type)
    const filename = `${randomUUID()}.${ext}`
    fs.writeFileSync(path.join(dir, filename), Buffer.from(arrayBuffer))

    // The URL prefix maps 1:1 to the on-disk segment because we resolve
    // userId server-side; the dirname segment uses sanitized id (cuid is safe).
    const safeUser = path.basename(dir)
    const url = `${COACH_UPLOAD_URL_PREFIX}${safeUser}/${filename}`

    return NextResponse.json(
      { url, mime: file.type, name: file.name ?? filename },
      { status: 201 }
    )
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[coach uploads POST]", e)
    return NextResponse.json({ error: "Upload failed." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const url = searchParams.get("url")
    if (!url) {
      return NextResponse.json({ error: "Missing url param." }, { status: 400 })
    }
    const resolved = resolveCoachUploadPath({ url, userId })
    if (!resolved) {
      return NextResponse.json({ error: "Invalid file." }, { status: 400 })
    }
    try {
      fs.unlinkSync(resolved.absPath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err
      }
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[coach uploads DELETE]", e)
    return NextResponse.json({ error: "Failed to delete file." }, { status: 500 })
  }
}
