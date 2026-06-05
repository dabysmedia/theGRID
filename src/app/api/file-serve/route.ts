import fs from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { getUploadSegmentDir } from "@/lib/uploads-path"

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

const ALLOWED_SEGMENTS = new Set(["journal", "avatars", "routine-covers", "coach"])

/**
 * Resolves a catch-all upload path (array of segments) to an absolute file
 * path on disk. Returns null if the path is invalid, the segment is unknown,
 * or the file extension is not an allowed image type.
 *
 * Accepted shapes:
 *   [segment, filename]           e.g. ["journal", "uuid.jpg"]
 *   [segment, userId, filename]   e.g. ["coach", "clxxx", "uuid.jpg"]
 */
function resolveUploadPath(segments: string[]): string | null {
  if (segments.length < 2 || segments.length > 3) return null

  const segment = segments[0]
  if (!ALLOWED_SEGMENTS.has(segment)) return null

  const filename = segments[segments.length - 1]
  if (!filename || filename !== path.basename(filename)) return null
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return null

  const ext = path.extname(filename).slice(1).toLowerCase()
  if (!MIME[ext]) return null

  if (segments.length === 3) {
    const userId = segments[1]
    if (!userId || userId !== path.basename(userId)) return null
    if (userId.includes("..") || userId.includes("/") || userId.includes("\\")) return null
    return path.join(getUploadSegmentDir(segment), userId, filename)
  }

  return path.join(getUploadSegmentDir(segment), filename)
}

/**
 * Unified static-file handler for all persistent upload segments.
 *
 * Receives the upload path via the `p` query parameter (set by the
 * next.config.ts rewrite). Handles paths like:
 *   /uploads/journal/<filename>
 *   /uploads/avatars/<filename>
 *   /uploads/routine-covers/<filename>
 *   /uploads/coach/<userId>/<filename>
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawPath = searchParams.get("p") ?? ""

  // Split into segments, filtering empty strings from leading/trailing slashes
  const segments = rawPath.split("/").filter(Boolean)

  const filePath = resolveUploadPath(segments)
  if (!filePath) {
    console.error("[file-serve] resolveUploadPath returned null for segments:", segments)
    return new NextResponse(null, { status: 404 })
  }

  console.error("[file-serve] resolved filePath:", filePath)

  if (!fs.existsSync(filePath)) {
    console.error("[file-serve] file not found on disk:", filePath)
    return new NextResponse(null, { status: 404 })
  }

  const ext = path.extname(filePath).slice(1).toLowerCase()
  const contentType = MIME[ext]
  if (!contentType) return new NextResponse(null, { status: 404 })

  const body = fs.readFileSync(filePath)
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
