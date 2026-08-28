import fs from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { resolveCoachUploadPath } from "@/lib/coach/uploads"
import { resolveUserId, UserError } from "@/lib/current-user"

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
 * Access control requires the active session to own the userId path segment.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ user: string; name: string }> }
) {
  try {
    const userId = await resolveUserId(req)
    const { user, name } = await context.params

    if (!user || user !== path.basename(user) || user.includes("..") || user.includes("/")) {
      return new NextResponse(null, { status: 404 })
    }
    if (!name || name !== path.basename(name) || name.includes("..") || name.includes("/")) {
      return new NextResponse(null, { status: 404 })
    }

    const resolved = resolveCoachUploadPath({ url: `/uploads/coach/${user}/${name}`, userId })
    if (!resolved) return new NextResponse(null, { status: 404 })

    const body = fs.readFileSync(resolved.absPath)
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": MIME[path.extname(name).slice(1).toLowerCase()] ?? resolved.mime,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof UserError) return new NextResponse(null, { status: error.status })
    console.error("[uploads coach GET]", error)
    return new NextResponse(null, { status: 500 })
  }
}
