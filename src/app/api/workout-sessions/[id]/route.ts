import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const session = await prisma.workoutSession.findUnique({ where: { id } })
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(session)
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
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

    const session = await prisma.workoutSession.update({ where: { id }, data })
    return NextResponse.json(session)
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await prisma.workoutSession.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
