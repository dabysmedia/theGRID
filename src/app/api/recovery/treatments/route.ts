import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

    const existing = await prisma.treatmentLog.findFirst({ where: { id, userId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (typeof body.completed === "boolean") data.completed = body.completed
    if (body.notes !== undefined) data.notes = body.notes == null ? null : String(body.notes).slice(0, 2000)

    const log = await prisma.treatmentLog.update({ where: { id }, data })
    return NextResponse.json(log)
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
    const { count } = await prisma.treatmentLog.deleteMany({ where: { id, userId } })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
