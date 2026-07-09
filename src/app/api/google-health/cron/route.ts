import { NextRequest, NextResponse } from "next/server"
import { isGoogleHealthConfigured } from "@/lib/google-health/config"
import { syncGoogleHealthForAllUsers } from "@/lib/google-health/sync"

/**
 * Periodic Google Health pull (steps + sleep by default).
 * Protected by CRON_SECRET — same pattern as /api/notifications/run.
 *
 * Suggested schedule: every 15 minutes.
 *   GET/POST https://itslos.com/api/google-health/cron?secret=CRON_SECRET
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

async function run(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isGoogleHealthConfigured()) {
    return NextResponse.json({
      skipped: true,
      reason: "Google Health OAuth is not configured",
    })
  }

  const url = new URL(req.url)
  const daysParam = Number(url.searchParams.get("days") ?? "3")
  const days = Number.isFinite(daysParam) ? daysParam : 3
  const includeWeight = url.searchParams.get("weight") === "1"

  try {
    const result = await syncGoogleHealthForAllUsers({
      days,
      metrics: {
        steps: true,
        sleep: true,
        weight: includeWeight,
      },
    })
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error("[google-health cron]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cron sync failed" },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  return run(req)
}

export async function GET(req: NextRequest) {
  return run(req)
}
