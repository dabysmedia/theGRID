import fs from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { getJournalUploadDir } from "@/lib/uploads-path"

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

/**
 * Serves journal images from the persistent upload dir (UPLOADS_PATH / volume).
 * Standalone Next serves static files from `.next/standalone/public`, which often
 * did not get the same symlink as `/app/public` at boot — this route always resolves
 * the real file path.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params
  if (!name || name !== path.basename(name) || name.includes("..") || name.includes("/")) {
    return new NextResponse(null, { status: 404 })
  }

  const ext = path.extname(name).slice(1).toLowerCase()
  const contentType = MIME[ext]
  if (!contentType) return new NextResponse(null, { status: 404 })

  const filePath = path.join(getJournalUploadDir(), name)
  if (!fs.existsSync(filePath)) return new NextResponse(null, { status: 404 })

  const body = fs.readFileSync(filePath)
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
