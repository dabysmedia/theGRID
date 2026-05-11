import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import {
  isNotificationKey,
  NOTIFICATION_CATALOG,
  parseTimeOfDay,
  type NotificationKey,
} from "@/lib/notifications/catalog"

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const rows = await prisma.notificationPreference.findMany({ where: { userId } })
    const byType = new Map(rows.map((r) => [r.type, r]))
    const merged = NOTIFICATION_CATALOG.map((def) => {
      const row = byType.get(def.key)
      return {
        key: def.key,
        enabled: row?.enabled ?? def.defaultEnabled,
        timeOfDay: row?.timeOfDay ?? def.defaultTime ?? null,
      }
    })
    return NextResponse.json({ preferences: merged })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: "Failed to load" }, { status: 500 })
  }
}

interface PrefPatch {
  key: string
  enabled?: boolean
  timeOfDay?: string | null
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = (await req.json()) as { updates?: PrefPatch[] }
    const updates = Array.isArray(body.updates) ? body.updates : []
    if (updates.length === 0) {
      return NextResponse.json({ error: "No updates" }, { status: 400 })
    }

    for (const u of updates) {
      if (!isNotificationKey(u.key)) {
        return NextResponse.json(
          { error: `Unknown notification key: ${u.key}` },
          { status: 400 }
        )
      }
      if (u.timeOfDay !== undefined && u.timeOfDay !== null) {
        if (parseTimeOfDay(u.timeOfDay) == null) {
          return NextResponse.json(
            { error: `Invalid time for ${u.key}` },
            { status: 400 }
          )
        }
      }
    }

    await prisma.$transaction(
      updates.map((u) => {
        const key = u.key as NotificationKey
        return prisma.notificationPreference.upsert({
          where: { userId_type: { userId, type: key } },
          create: {
            userId,
            type: key,
            enabled: u.enabled ?? true,
            timeOfDay: u.timeOfDay ?? null,
          },
          update: {
            ...(u.enabled !== undefined ? { enabled: u.enabled } : {}),
            ...(u.timeOfDay !== undefined ? { timeOfDay: u.timeOfDay } : {}),
          },
        })
      })
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[notif prefs PATCH]", e)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}
