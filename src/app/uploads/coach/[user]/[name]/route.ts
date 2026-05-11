import fs from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { getCoachUploadDir } from "@/lib/coach/uploads"

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

/**
 * Serves AI Coach attachment images from the persistent upload dir.
 * Path layout matches the upload route: `/uploads/coach/<userId>/<uuid>.<ext>`.
 *
 * Access control relies on the unguessable UUID filename (same model as the
 * journal upload route). The userId path segment is included so attachments
 * can be cleaned up per-user without scanning the whole directory.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ user: string; name: string }> }
) {
  const { user, name } = await context.params

  if (!user || user !== path.basename(user) || user.includes("..") || user.includes("/")) {
    return new NextResponse(null, { status: 404 })
  }
  if (!name || name !== path.basename(name) || name.includes("..") || name.includes("/")) {
    return new NextResponse(null, { status: 404 })
  }

  const ext = path.extname(name).slice(1).toLowerCase()
  const contentType = MIME[ext]
  if (!contentType) return new NextResponse(null, { status: 404 })

  const filePath = path.join(getCoachUploadDir(), user, name)
  if (!fs.existsSync(filePath)) return new NextResponse(null, { status: 404 })

  const body = fs.readFileSync(filePath)
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  })
}
