import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { revokeGoogleToken } from "@/lib/google-health/tokens"

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const conn = await prisma.googleHealthConnection.findUnique({ where: { userId } })
    if (!conn) {
      return NextResponse.json({ ok: true, disconnected: false })
    }
    await revokeGoogleToken(conn.refreshToken || conn.accessToken)
    await prisma.googleHealthConnection.delete({ where: { userId } })
    return NextResponse.json({ ok: true, disconnected: true })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 })
  }
}
