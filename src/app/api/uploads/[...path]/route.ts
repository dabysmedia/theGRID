import fs from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { resolveUploadFilePath } from "@/lib/uploads-path"

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

const PUBLIC_SEGMENTS = new Set(["avatars", "journal", "routine-covers"])

function isSafeSegment(value: string): boolean {
  return Boolean(value) && value === path.basename(value) && !value.includes("..") && !value.includes("\\")
}

function resolveUploadPath(parts: string[]): { filePath: string; contentType: string; cacheControl: string } | null {
  const [segment, ...rest] = parts
  if (!segment || rest.length === 0) return null

  if (!PUBLIC_SEGMENTS.has(segment) && segment !== "coach" && segment !== "food") return null
  if (!rest.every(isSafeSegment)) return null
  const userScoped = segment === "coach" || segment === "food"
  if (!userScoped && rest.length !== 1) return null
  if (userScoped && rest.length !== 2) return null

  const filename = rest[rest.length - 1]
  const ext = path.extname(filename).slice(1).toLowerCase()
  const contentType = MIME[ext]
  if (!contentType) return null

  const filePath = resolveUploadFilePath(segment, ...rest)
  if (!filePath) return null

  return {
    filePath,
    contentType,
    cacheControl:
      userScoped
        ? "private, max-age=31536000, immutable"
        : "public, max-age=31536000, immutable",
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await context.params
  const resolved = resolveUploadPath(parts ?? [])
  if (!resolved || !fs.existsSync(resolved.filePath)) {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(fs.readFileSync(resolved.filePath), {
    status: 200,
    headers: {
      "Content-Type": resolved.contentType,
      "Cache-Control": resolved.cacheControl,
    },
  })
}
