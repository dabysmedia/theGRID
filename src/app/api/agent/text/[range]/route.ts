import { NextRequest, NextResponse } from "next/server"
import { AgentAccessError } from "@/lib/agent/access"
import { agentBaseFromRequest } from "@/lib/agent/base-url"
import { exportRangeForAgent } from "@/lib/agent/export-profile"
import { AGENT_RANGE_PRESETS, resolveAgentRange } from "@/lib/agent/ranges"
import { buildRangeTextReport } from "@/lib/agent/text-report"
import { agentTodayKey, resolveAgentTimezone } from "@/lib/agent/timezone"
import { resolveAgentViewerFromRequest } from "@/lib/agent/viewer"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * Plain-text snapshot for one window, e.g. /api/agent/text/7d. No auth, no
 * query string, no JS — a crawler can GET this directly.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ range: string }> }
) {
  try {
    const viewer = await resolveAgentViewerFromRequest(req)
    const { range: slug } = await params

    const profile = await prisma.user.findUnique({
      where: { id: viewer.id },
      select: { timeZone: true },
    })
    const tz = resolveAgentTimezone(profile?.timeZone)
    const todayKey = agentTodayKey(new Date(), profile?.timeZone)
    const range = resolveAgentRange(slug, todayKey, tz)
    if (!range) {
      return new NextResponse(
        [
          `Unknown range "${slug}".`,
          ``,
          `Valid ranges:`,
          ...AGENT_RANGE_PRESETS.map((p) => `  ${p.key} — ${p.description}`),
          `  <N>d — any rolling window up to 1825 days, e.g. 45d`,
          `  YYYY-MM-DD — a single day`,
          `  YYYY-MM-DD..YYYY-MM-DD — an explicit window`,
        ].join("\n"),
        { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      )
    }

    const base = agentBaseFromRequest(req)
    const snapshot = await exportRangeForAgent(viewer.id, range)

    return new NextResponse(buildRangeTextReport(base, viewer.name, snapshot), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "X-Robots-Tag": "index, follow",
      },
    })
  } catch (e) {
    if (e instanceof AgentAccessError) {
      return new NextResponse(e.message, {
        status: e.status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }
    console.error("[api/agent/text]", e)
    return new NextResponse("Failed to build snapshot.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
}
