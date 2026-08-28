import fs from "node:fs"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { getJournalUploadDir, resolveUploadFilePath } from "@/lib/uploads-path"
import { resolveUserId, UserError } from "@/lib/current-user"
import { safeJournalStoragePath } from "@/lib/journal-photo"
import { prisma } from "@/lib/prisma"
import { resolveCoachUploadPath } from "@/lib/coach/uploads"
import { resolveFoodUploadPath } from "@/lib/calories/food-uploads"

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
}

const PUBLIC_SEGMENTS = new Set(["avatars", "routine-covers"])

function isSafeSegment(value: string): boolean {
  return Boolean(value) && value === path.basename(value) && !value.includes("..") && !value.includes("\\")
}

function resolveUploadPath(parts: string[]): { filePath: string; contentType: string; cacheControl: string } | null {
  const [segment, ...rest] = parts
  if (!segment || rest.length === 0) return null

  if (!PUBLIC_SEGMENTS.has(segment)) return null
  if (!rest.every(isSafeSegment)) return null
  if (rest.length !== 1) return null

  const filename = rest[rest.length - 1]
  const ext = path.extname(filename).slice(1).toLowerCase()
  const contentType = MIME[ext]
  if (!contentType) return null

  const filePath = resolveUploadFilePath(segment, ...rest)
  if (!filePath) return null

  return {
    filePath,
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await context.params
  if (parts?.[0] === "journal") {
    try {
      const userId = await resolveUserId(req)
      if (parts.length !== 2 || !isSafeSegment(parts[1])) {
        return new NextResponse(null, { status: 404 })
      }

      const photo = await prisma.journalPhoto.findUnique({
        where: { id: parts[1] },
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

      const legacy = resolveUploadFilePath("journal", parts[1])
      if (!legacy || !fs.existsSync(legacy)) return new NextResponse(null, { status: 404 })
      const ext = path.extname(parts[1]).slice(1).toLowerCase()
      const contentType = MIME[ext]
      if (!contentType) return new NextResponse(null, { status: 404 })
      return new NextResponse(fs.readFileSync(legacy), {
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

  if (parts?.[0] === "coach" || parts?.[0] === "food") {
    try {
      const userId = await resolveUserId(req)
      if (parts.length !== 3 || !parts.slice(1).every(isSafeSegment)) {
        return new NextResponse(null, { status: 404 })
      }
      const url = `/uploads/${parts.join("/")}`
      const filePath =
        parts[0] === "coach"
          ? resolveCoachUploadPath({ url, userId })?.absPath ?? null
          : resolveFoodUploadPath({ url, userId })
      if (!filePath || !fs.existsSync(filePath)) return new NextResponse(null, { status: 404 })
      const ext = path.extname(filePath).slice(1).toLowerCase()
      const contentType = MIME[ext]
      if (!contentType) return new NextResponse(null, { status: 404 })
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
      console.error("[uploads private GET]", error)
      return new NextResponse(null, { status: 500 })
    }
  }

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
