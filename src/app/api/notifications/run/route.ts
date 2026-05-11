import { NextRequest, NextResponse } from "next/server"
import { runNotificationDispatch } from "@/lib/notifications/server/dispatch"

/**
 * Called every ~5 minutes by an external cron (Railway cron job, GitHub Actions,
 * Vercel cron, EasyCron, …). Protected by a shared `CRON_SECRET` (Bearer header
 * or `?secret=` for cron services that can't set headers).
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
    const result = await runNotificationDispatch()
    return NextResponse.json(result)
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
