import { NextRequest, NextResponse } from "next/server"
import { AgentAccessError } from "@/lib/agent/access"
import { agentBaseFromRequest } from "@/lib/agent/base-url"
import { exportRangeForAgent } from "@/lib/agent/export-profile"
import { AGENT_RANGE_PRESETS, resolveAgentRange } from "@/lib/agent/ranges"
import { agentTodayKey, resolveAgentTimezone } from "@/lib/agent/timezone"
import { resolveAgentViewerFromRequest } from "@/lib/agent/viewer"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/** Structured snapshot for one window, e.g. /api/agent/json/30d. */
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
      return NextResponse.json(
        {
          error: `Unknown range "${slug}".`,
          validRanges: AGENT_RANGE_PRESETS,
          alsoAccepted: ["<N>d (1–1825)", "YYYY-MM-DD", "YYYY-MM-DD..YYYY-MM-DD"],
        },
        { status: 404 }
      )
    }

    const base = agentBaseFromRequest(req)
    const snapshot = await exportRangeForAgent(viewer.id, range)

    return NextResponse.json(
      {
        ...snapshot,
        _meta: {
          profileName: viewer.name,
          text: `${base}/api/agent/text/${range.key}`,
          html: `${base}/agents/${range.key}`,
          allRanges: AGENT_RANGE_PRESETS.map((p) => ({
            ...p,
            json: `${base}/api/agent/json/${p.key}`,
            text: `${base}/api/agent/text/${p.key}`,
          })),
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
          "X-Robots-Tag": "index, follow",
        },
      }
    )
  } catch (e) {
    if (e instanceof AgentAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[api/agent/json]", e)
    return NextResponse.json({ error: "Failed to build snapshot." }, { status: 500 })
  }
}
