import "server-only"

import { prisma } from "@/lib/prisma"
import { NOTIFICATION_CATALOG, type NotificationKey } from "../catalog"
import { sendPushToUser } from "./send"
import {
  alreadyHandledToday,
  buildEvalContext,
  evaluate,
  recordNotificationLog,
} from "./evaluators"
import { isValidTimeZone } from "./local-time"

const FALLBACK_TZ = "UTC"

export interface DispatchResult {
  evaluatedUsers: number
  sent: number
  skipped: number
  errors: number
  details: Array<{
    userId: string
    type: NotificationKey
    status: "sent" | "skipped" | "duplicate" | "no_subs" | "error"
    successCount?: number
    failureCount?: number
    error?: string
  }>
}

/**
 * Evaluates every (user × subscribed notification preference) pair and sends
 * any that match. Intended to be called every 5 minutes by an external cron.
 *
 * Idempotency: once a (userId, type, fireDay) tuple is logged it won't fire
 * again that local day, so it's safe to call this more often than 5 minutes.
 */
export async function runNotificationDispatch(now = new Date()): Promise<DispatchResult> {
  const result: DispatchResult = {
    evaluatedUsers: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  }

  const prefs = await prisma.notificationPreference.findMany({
    where: { enabled: true },
    include: { user: { select: { id: true, timeZone: true } } },
  })
  if (prefs.length === 0) return result

  // Group by user so we only build EvalContext once per user.
  const byUser = new Map<string, { tz: string; rows: typeof prefs }>()
  for (const pref of prefs) {
    const tz = isValidTimeZone(pref.user.timeZone) ? pref.user.timeZone! : FALLBACK_TZ
    const entry = byUser.get(pref.user.id) ?? { tz, rows: [] as typeof prefs }
    entry.rows.push(pref)
    byUser.set(pref.user.id, entry)
  }

  for (const [userId, { tz, rows }] of byUser) {
    result.evaluatedUsers += 1
    const ctx = buildEvalContext(userId, now, tz)

    for (const pref of rows) {
      const type = pref.type as NotificationKey
      try {
        if (await alreadyHandledToday(userId, type, ctx.local.dayKey)) {
          result.skipped += 1
          result.details.push({ userId, type, status: "duplicate" })
          continue
        }
        const evalResult = await evaluate(type, {
          ctx,
          timeOfDay: pref.timeOfDay ?? null,
        })
        if (!evalResult.shouldSend) {
          if (evalResult.recordOnSkip) {
            await recordNotificationLog(userId, type, ctx.local.dayKey, 0, 0)
          }
          result.skipped += 1
          result.details.push({ userId, type, status: "skipped" })
          continue
        }

        const { payload } = evalResult
        if (!payload) {
          result.skipped += 1
          result.details.push({ userId, type, status: "skipped" })
          continue
        }

        const subCount = await prisma.pushSubscription.count({ where: { userId } })
        if (subCount === 0) {
          result.details.push({ userId, type, status: "no_subs" })
          await recordNotificationLog(userId, type, ctx.local.dayKey, 0, 0)
          continue
        }

        const send = await sendPushToUser(userId, payload)
        await recordNotificationLog(
          userId,
          type,
          ctx.local.dayKey,
          send.successCount,
          send.failureCount
        )
        if (send.successCount > 0) {
          result.sent += 1
          result.details.push({
            userId,
            type,
            status: "sent",
            successCount: send.successCount,
            failureCount: send.failureCount,
          })
        } else {
          result.errors += 1
          result.details.push({
            userId,
            type,
            status: "error",
            failureCount: send.failureCount,
          })
        }
      } catch (err) {
        result.errors += 1
        result.details.push({
          userId,
          type,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  return result
}

/** Default-on toggles for a fresh user — called once on first subscribe. */
export async function ensureDefaultPreferences(userId: string): Promise<void> {
  const existing = await prisma.notificationPreference.findMany({
    where: { userId },
    select: { type: true },
  })
  const have = new Set(existing.map((r) => r.type))
  const inserts: { userId: string; type: string; enabled: boolean; timeOfDay: string | null }[] = []
  for (const def of NOTIFICATION_CATALOG) {
    if (have.has(def.key)) continue
    inserts.push({
      userId,
      type: def.key,
      enabled: def.defaultEnabled,
      timeOfDay: def.defaultTime ?? null,
    })
  }
  if (inserts.length === 0) return
  await prisma.$transaction(
    inserts.map((row) =>
      prisma.notificationPreference.create({ data: row })
    )
  )
}
