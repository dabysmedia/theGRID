import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

/**
 * Resolve the persistent data root from environment variables, mirroring the
 * logic in scripts/prepare-volume.mjs so uploads land on the same volume that
 * prepare-volume.mjs symlinks into public/uploads/*.
 */
function dataRoot(): string | null {
  const dir = process.env.DATA_DIR?.trim()
  if (dir) return dir.replace(/\/+$/, "")

  const p = process.env.DATABASE_PATH?.trim()
  if (p) {
    const s = p.replace(/^file:/, "").replace(/\/+$/, "")
    const resolved = path.resolve(s)
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        return resolved
      }
    } catch {
      /* ignore */
    }
    return path.dirname(resolved)
  }

  const url = process.env.DATABASE_URL?.trim()
  if (url?.startsWith("file:")) {
    const f = url.slice(5).trim()
    const resolved = path.resolve(f)
    return path.dirname(resolved)
  }

  return null
}

function getUploadDir(): string {
  // When DATA_DIR is set, always write directly to the persistent volume.
  // Avoid any process.cwd() fallback here — in a Next.js standalone build
  // cwd() points to .next/standalone, not /app, so the symlinks created by
  // prepare-volume.mjs would be bypassed and uploads would be lost on redeploy.
  const dataDir = process.env.DATA_DIR?.trim()
  if (dataDir) {
    return path.join(dataDir.replace(/\/+$/, ""), "uploads", "journal")
  }

  // DATABASE_PATH also signals a persistent volume is configured. Use dataRoot()
  // to derive the directory, but only when DATABASE_PATH is explicitly set so we
  // never silently fall back to a cwd()-relative path when a volume is expected.
  const dbPath = process.env.DATABASE_PATH?.trim()
  if (dbPath) {
    const root = dataRoot()
    // dataRoot() is guaranteed non-null when DATABASE_PATH is set.
    return path.join(root!, "uploads", "journal")
  }

  // Local dev only: no volume configured, serve from the public directory.
  return path.join(process.cwd(), "public", "uploads", "journal")
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
