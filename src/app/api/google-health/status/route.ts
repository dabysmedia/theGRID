import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { isGoogleHealthConfigured } from "@/lib/google-health/config"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const configured = isGoogleHealthConfigured()
    const conn = await prisma.googleHealthConnection.findUnique({
      where: { userId },
      select: {
        googleAccount: true,
        scope: true,
        lastSyncAt: true,
        lastSyncError: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json({
      configured,
      connected: Boolean(conn),
      googleAccount: conn?.googleAccount ?? null,
      lastSyncAt: conn?.lastSyncAt?.toISOString() ?? null,
      lastSyncError: conn?.lastSyncError ?? null,
      connectedAt: conn?.createdAt?.toISOString() ?? null,
    })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 })
  }
}
