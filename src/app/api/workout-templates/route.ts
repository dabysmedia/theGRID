import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/prisma"
import { getRoutineCoversUploadDir } from "@/lib/uploads-path"
import { normalizeRoutineCoverUrl, ROUTINE_COVER_PREFIX } from "@/lib/routine-cover-url"
import { ensureSequentialWorkoutTemplateSortOrders } from "@/lib/workout-template-sort"
import { resolveUserId, UserError } from "@/lib/current-user"

const MAX_TAGS = 12
const MAX_TAG_LEN = 40

function normalizeTagsJson(raw: unknown): string {
  let list: unknown[] = []
  if (raw === undefined || raw === null) {
    list = []
  } else if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) list = []
    else {
      try {
        const parsed = JSON.parse(t) as unknown
        list = Array.isArray(parsed) ? parsed : []
      } catch {
        list = []
      }
    }
  } else if (Array.isArray(raw)) {
    list = raw
  } else {
    list = []
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    if (typeof item !== "string") continue
    const t = item.trim().slice(0, MAX_TAG_LEN)
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= MAX_TAGS) break
  }
  return JSON.stringify(out)
}

function tryUnlinkRoutineCoverFile(url: string | null | undefined) {
  if (!url?.startsWith(ROUTINE_COVER_PREFIX)) return
  const filename = path.basename(url)
  if (filename.includes("..") || filename.includes("/")) return
  try {
    const fp = path.join(getRoutineCoversUploadDir(), filename)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
  } catch {
    /* ignore */
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    await ensureSequentialWorkoutTemplateSortOrders(userId)
    const templates = await prisma.workoutTemplate.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    })
    return NextResponse.json(templates)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const { name, exercises } = body
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    await ensureSequentialWorkoutTemplateSortOrders(userId)
    const maxSort = await prisma.workoutTemplate.aggregate({
      _max: { sortOrder: true },
      where: { userId },
    })
    const nextSortOrder = (maxSort._max.sortOrder ?? -1) + 1
    const coverImageUrl = normalizeRoutineCoverUrl(body.coverImageUrl)
    const tagsJson = normalizeTagsJson(body.tags)
    const template = await prisma.workoutTemplate.create({
      data: {
        name: name.trim(),
        exercises: JSON.stringify(Array.isArray(exercises) ? exercises : []),
        tags: tagsJson,
        coverImageUrl,
        sortOrder: nextSortOrder,
        userId,
      },
    })
    return NextResponse.json(template, { status: 201 })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const { id, name, exercises } = body
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const existing = await prisma.workoutTemplate.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const coverInBody = Object.prototype.hasOwnProperty.call(body, "coverImageUrl")
    const nextCover = coverInBody ? normalizeRoutineCoverUrl(body.coverImageUrl) : undefined

    if (coverInBody && nextCover !== existing.coverImageUrl) {
      tryUnlinkRoutineCoverFile(existing.coverImageUrl)
    }

    const template = await prisma.workoutTemplate.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(exercises !== undefined
          ? { exercises: JSON.stringify(Array.isArray(exercises) ? exercises : []) }
          : {}),
        ...(coverInBody ? { coverImageUrl: nextCover ?? null } : {}),
        /** Always persist tags on PUT — client always sends an array (possibly empty). */
        tags: normalizeTagsJson(body.tags),
      },
    })
    return NextResponse.json(template)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const row = await prisma.workoutTemplate.findFirst({ where: { id, userId } })
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

    tryUnlinkRoutineCoverFile(row.coverImageUrl)
    await prisma.workoutTemplate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}

/** Body: `{ orderedIds: string[] }` — full permutation of this user's template ids. */
export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const orderedIds = body?.orderedIds
    if (!Array.isArray(orderedIds) || !orderedIds.every((id: unknown) => typeof id === "string")) {
      return NextResponse.json({ error: "orderedIds must be an array of strings" }, { status: 400 })
    }
    const existing = await prisma.workoutTemplate.findMany({
      where: { userId },
      select: { id: true },
    })
    const idSet = new Set(existing.map((e) => e.id))
    if (orderedIds.length !== idSet.size) {
      return NextResponse.json({ error: "orderedIds length must match template count" }, { status: 400 })
    }
    for (const id of orderedIds) {
      if (!idSet.has(id)) {
        return NextResponse.json({ error: "Unknown template id in orderedIds" }, { status: 400 })
      }
    }
    await prisma.$transaction(
      orderedIds.map((id: string, i: number) =>
        prisma.workoutTemplate.update({
          where: { id },
          data: { sortOrder: i },
        }),
      ),
    )
    const templates = await prisma.workoutTemplate.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    })
    return NextResponse.json(templates)
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to reorder" }, { status: 500 })
  }
}
