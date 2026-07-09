import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { isGoogleHealthConfigured } from "@/lib/google-health/config"
import { syncGoogleHealthForUser } from "@/lib/google-health/sync"

export async function POST(req: NextRequest) {
  try {
    if (!isGoogleHealthConfigured()) {
      return NextResponse.json(
        { error: "Google Health OAuth is not configured on the server." },
        { status: 503 },
      )
    }
    const userId = await resolveUserId(req)
    const conn = await prisma.googleHealthConnection.findUnique({ where: { userId } })
    if (!conn) {
      return NextResponse.json({ error: "Connect Google Health first." }, { status: 400 })
    }

    let days = 30
    try {
      const body = await req.json().catch(() => ({}))
      if (body?.days != null) days = Number(body.days)
    } catch {
      /* empty body ok */
    }

    const result = await syncGoogleHealthForUser(userId, { days })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    const message = e instanceof Error ? e.message : "Sync failed"
    try {
      const userId = await resolveUserId(req)
      await prisma.googleHealthConnection.updateMany({
        where: { userId },
        data: { lastSyncError: message },
      })
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
