import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars")
const MAX_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
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

function publicPathForFile(filename: string): string {
  return `/uploads/avatars/${filename}`
}

function unlinkPublicUpload(url: string | null) {
  if (!url?.startsWith("/uploads/avatars/")) return
  const filename = path.basename(url)
  if (filename.includes("..") || filename.includes("/") || !filename) return
  const filePath = path.join(UPLOAD_DIR, filename)
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

/** Remove any on-disk avatar files for this user (id may include safe chars only). */
function removeExistingAvatarFiles(userId: string) {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) return
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      if (f.startsWith(`${userId}.`)) {
        fs.unlinkSync(path.join(UPLOAD_DIR, f))
      }
    }
  } catch {
    /* ignore */
  }
}

function userJson(u: { id: string; name: string; avatarColor: string; avatarUrl: string | null }) {
  return {
    id: u.id,
    name: u.name,
    avatarColor: u.avatarColor,
    avatarUrl: u.avatarUrl,
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
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
        { error: "File too large. Maximum size is 5 MB." },
        { status: 400 }
      )
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    })
    if (existing?.avatarUrl) {
      unlinkPublicUpload(existing.avatarUrl)
    }
    removeExistingAvatarFiles(userId)

    ensureUploadDir()
    const ext = extFromMime(file.type)
    const filename = `${userId}.${ext}`
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), Buffer.from(arrayBuffer))

    const avatarUrl = publicPathForFile(filename)
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, name: true, avatarColor: true, avatarUrl: true },
    })

    return NextResponse.json({ user: userJson(updated) }, { status: 200 })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[users/avatar POST]", e)
    return NextResponse.json({ error: "Upload failed." }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const userId = await resolveUserId(_req)
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    })
    if (existing?.avatarUrl) {
      unlinkPublicUpload(existing.avatarUrl)
    }
    removeExistingAvatarFiles(userId)

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: { id: true, name: true, avatarColor: true, avatarUrl: true },
    })

    return NextResponse.json({ user: userJson(updated) })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[users/avatar DELETE]", e)
    return NextResponse.json({ error: "Failed to remove avatar." }, { status: 500 })
  }
}
