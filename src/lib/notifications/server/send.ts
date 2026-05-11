import "server-only"

import { prisma } from "@/lib/prisma"
import { configureVapid, webpush } from "./vapid"
import type { NotificationKey } from "../catalog"

export interface PushPayload {
  /** Notification title (short, < 50 chars) */
  title: string
  /** Body text (single line, < 120 chars works best on iOS) */
  body: string
  /** Target URL when the user taps. Relative ("/calories") or absolute. */
  url?: string
  /** Lucide icon name as a path override; defaults to /icons/icon.svg */
  icon?: string
  /** Used to coalesce repeated notifications of the same kind */
  tag?: string
  /** Logical type so the SW / client analytics can react */
  type?: NotificationKey | "test"
}

export interface SendResult {
  successCount: number
  failureCount: number
}

/**
 * Push `payload` to every active subscription belonging to `userId`.
 *
 * Subscriptions that come back as 404/410 from the push service are deleted —
 * those endpoints are permanently gone (PWA uninstalled, permission revoked).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<SendResult> {
  const config = configureVapid()
  if (!config.ok) {
    console.error("[push] VAPID not configured:", config.error)
    return { successCount: 0, failureCount: 0 }
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  if (subs.length === 0) return { successCount: 0, failureCount: 0 }

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    icon: payload.icon ?? "/icons/icon.svg",
    tag: payload.tag,
    type: payload.type ?? null,
  })

  let successCount = 0
  let failureCount = 0
  const deadEndpoints: string[] = []
  const usedEndpoints: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadString,
          { TTL: 60 * 60 * 24 }
        )
        successCount += 1
        usedEndpoints.push(sub.endpoint)
      } catch (err: unknown) {
        failureCount += 1
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined
        if (status === 404 || status === 410) {
          deadEndpoints.push(sub.endpoint)
        } else {
          console.error("[push] send failed", status, err)
        }
      }
    })
  )

  if (deadEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: deadEndpoints } },
    })
  }
  if (usedEndpoints.length > 0) {
    await prisma.pushSubscription.updateMany({
      where: { endpoint: { in: usedEndpoints } },
      data: { lastUsedAt: new Date() },
    })
  }

  return { successCount, failureCount }
}
