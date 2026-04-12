import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizeRoutineCoverUrl } from "@/lib/routine-cover-url"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserId(req)
    const { id } = await params
    const session = await prisma.workoutSession.findFirst({ where: { id, userId } })
    if (!session)
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store, must-revalidate" } },
      )
    return NextResponse.json(session, {
      headers: { "Cache-Control": "no-store, must-revalidate" },
    })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json(
      { error: "Failed to fetch" },
      { status: 500, headers: { "Cache-Control": "no-store, must-revalidate" } },
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserId(req)
    const { id } = await params
    const existing = await prisma.workoutSession.findFirst({ where: { id, userId } })
    if (!existing)
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store, must-revalidate" } },
      )

    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.notes !== undefined) data.notes = body.notes || null
    if (body.status !== undefined) data.status = body.status
    if (body.duration !== undefined) data.duration = body.duration ? Number(body.duration) : null
    if (body.finishedAt !== undefined)
      data.finishedAt = body.finishedAt ? new Date(body.finishedAt) : null
    if (body.exercises !== undefined)
      data.exercises = JSON.stringify(Array.isArray(body.exercises) ? body.exercises : [])
    if (Object.prototype.hasOwnProperty.call(body, "bodyWeightLb")) {
      const raw = body.bodyWeightLb
      if (raw === null || raw === "" || raw === undefined) {
        data.bodyWeightLb = null
      } else {
        const n = Number(raw)
        data.bodyWeightLb = Number.isFinite(n) && n > 0 ? n : null
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "coverImageUrl")) {
      data.coverImageUrl = normalizeRoutineCoverUrl(body.coverImageUrl) ?? null
    }

    const session = await prisma.workoutSession.update({ where: { id }, data })
    return NextResponse.json(session, {
      headers: { "Cache-Control": "no-store, must-revalidate" },
    })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json(
      { error: "Failed to update" },
      { status: 500, headers: { "Cache-Control": "no-store, must-revalidate" } },
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserId(req)
    const { id } = await params
    const { count } = await prisma.workoutSession.deleteMany({ where: { id, userId } })
    if (!count)
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store, must-revalidate" } },
      )
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store, must-revalidate" } },
    )
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json(
      { error: "Failed to delete" },
      { status: 500, headers: { "Cache-Control": "no-store, must-revalidate" } },
    )
  }
}
