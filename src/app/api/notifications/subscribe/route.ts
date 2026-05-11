import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveUserId, UserError } from "@/lib/current-user"
import { isValidTimeZone } from "@/lib/notifications/server/local-time"
import { ensureDefaultPreferences } from "@/lib/notifications/server/dispatch"

interface SubscribeBody {
  subscription?: {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }
  timeZone?: string
  userAgent?: string
}

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const body = (await req.json()) as SubscribeBody
    const sub = body.subscription
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return NextResponse.json(
        { error: "Subscription payload missing endpoint or keys." },
        { status: 400 }
      )
    }

    const tz = isValidTimeZone(body.timeZone) ? body.timeZone! : null
    if (tz) {
      await prisma.user.update({ where: { id: userId }, data: { timeZone: tz } })
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: body.userAgent ?? null,
      },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: body.userAgent ?? undefined,
        lastUsedAt: new Date(),
      },
    })

    await ensureDefaultPreferences(userId)

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[push subscribe]", e)
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const { searchParams } = new URL(req.url)
    const endpoint = searchParams.get("endpoint")
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint required" }, { status: 400 })
    }
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[push unsubscribe]", e)
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req)
    const subs = await prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
      },
    })
    return NextResponse.json({ subscriptions: subs })
  } catch (e) {
    if (e instanceof UserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: "Failed to load" }, { status: 500 })
  }
}
