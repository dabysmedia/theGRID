import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { getAvatarsUploadDir } from "@/lib/uploads-path"

const MAX_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function ensureDir() {
  const dir = getAvatarsUploadDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function unlinkStoredAvatar(url: string | null | undefined) {
  if (!url?.startsWith("/uploads/avatars/")) return
  const name = path.basename(url)
  if (name.includes("..") || name.includes("/") || !name) return
  const fp = path.join(getAvatarsUploadDir(), name)
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
  } catch {
    /* ignore */
  }
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }
  return map[mime] ?? "jpg"
}

function publicPathForFile(filename: string) {
  return `/uploads/avatars/${filename}`
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
        { error: "Only JPEG, PNG, and WebP images are allowed." },
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

    const existing = await prisma.user.findFirst({
      where: { id: userId },
      select: { avatarUrl: true },
    })
    if (existing?.avatarUrl) unlinkStoredAvatar(existing.avatarUrl)

    ensureDir()
    const ext = extFromMime(file.type)
    const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "")
    const filename = `${safeId || "user"}-${randomUUID()}.${ext}`
    const filePath = path.join(getAvatarsUploadDir(), filename)
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    const avatarUrl = publicPathForFile(filename)
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, name: true, avatarColor: true, avatarUrl: true },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[users/avatar POST]", e)
    return NextResponse.json({ error: "Upload failed." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const existing = await prisma.user.findFirst({
      where: { id: userId },
      select: { avatarUrl: true },
    })
    if (existing?.avatarUrl) unlinkStoredAvatar(existing.avatarUrl)

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: { id: true, name: true, avatarColor: true, avatarUrl: true },
    })

    return NextResponse.json({ user })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[users/avatar DELETE]", e)
    return NextResponse.json({ error: "Failed to remove avatar." }, { status: 500 })
  }
}
