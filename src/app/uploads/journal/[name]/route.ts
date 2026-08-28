import fs from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { resolveUserId, UserError } from "@/lib/current-user"
import { safeJournalStoragePath } from "@/lib/journal-photo"
import { prisma } from "@/lib/prisma"
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
  req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const userId = await resolveUserId(req)
    const { name } = await context.params
    if (!name || name !== path.basename(name) || name.includes("..") || name.includes("/")) {
      return new NextResponse(null, { status: 404 })
    }

    const photo = await prisma.journalPhoto.findUnique({
      where: { id: name },
      select: { storageKey: true, mimeType: true, userId: true, journalEntryId: true },
    })
    if (photo) {
      if (!photo.journalEntryId && photo.userId !== userId) {
        return new NextResponse(null, { status: 404 })
      }
      const filePath = safeJournalStoragePath(getJournalUploadDir(), photo.storageKey)
      if (!filePath || !fs.existsSync(filePath)) return new NextResponse(null, { status: 404 })
      return new NextResponse(fs.readFileSync(filePath), {
        status: 200,
        headers: {
          "Content-Type": photo.mimeType,
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      })
    }

    const ext = path.extname(name).slice(1).toLowerCase()
    const contentType = MIME[ext]
    if (!contentType) return new NextResponse(null, { status: 404 })

    const filePath = path.join(getJournalUploadDir(), name)
    if (!fs.existsSync(filePath)) return new NextResponse(null, { status: 404 })
    return new NextResponse(fs.readFileSync(filePath), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof UserError) return new NextResponse(null, { status: error.status })
    console.error("[uploads journal GET]", error)
    return new NextResponse(null, { status: 500 })
  }
}
