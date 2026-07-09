import { NextRequest, NextResponse } from "next/server"
import { runNotificationDispatch } from "@/lib/notifications/server/dispatch"
import { isGoogleHealthConfigured } from "@/lib/google-health/config"
import { syncGoogleHealthForAllUsers } from "@/lib/google-health/sync"

/**
 * Called every ~5 minutes by an external cron (Railway cron job, GitHub Actions,
 * Vercel cron, EasyCron, …). Protected by a shared `CRON_SECRET` (Bearer header
 * or `?secret=` for cron services that can't set headers).
 *
 * Also pulls Google Health steps/sleep/vitals for connected users (lightweight lookback)
 * so Fitbit data stays fresh without a separate cron.
 */
async function authorize(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const auth = req.headers.get("authorization") ?? ""
  if (auth === `Bearer ${expected}`) return true
  const url = new URL(req.url)
  if (url.searchParams.get("secret") === expected) return true
  return false
}

export async function POST(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const notifications = await runNotificationDispatch()

    let googleHealth:
      | { skipped: true; reason: string }
      | Awaited<ReturnType<typeof syncGoogleHealthForAllUsers>>
      | { error: string } = { skipped: true, reason: "not configured" }

    if (isGoogleHealthConfigured()) {
      try {
        googleHealth = await syncGoogleHealthForAllUsers({
          days: 3,
          metrics: { steps: true, sleep: true, weight: false, vitals: true },
        })
      } catch (e) {
        console.error("[google-health via notif cron]", e)
        googleHealth = { error: e instanceof Error ? e.message : "Google Health sync failed" }
      }
    }

    return NextResponse.json({ notifications, googleHealth })
  } catch (e) {
    console.error("[notif run]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Dispatch failed" },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
