import { NextRequest, NextResponse } from "next/server"
import { AgentAccessError } from "@/lib/agent/access"
import { agentBaseFromRequest } from "@/lib/agent/base-url"
import { exportProfileForAgent, exportRangeForAgent } from "@/lib/agent/export-profile"
import { AGENT_RANGE_PRESETS, resolveAgentRangeFromParams } from "@/lib/agent/ranges"
import { buildRangeTextReport } from "@/lib/agent/text-report"
import { agentTodayKey, resolveAgentTimezone } from "@/lib/agent/timezone"
import { resolveAgentViewerFromRequest } from "@/lib/agent/viewer"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * Full machine-readable profile export. Serves the authenticated session's
 * profile when one is present, otherwise the public crawl profile.
 *
 * Without params this returns the complete all-time dump (today/week/month
 * rollups plus every row). With `?range=` / `?from=&to=` it returns the same
 * single-window snapshot as /api/agent/json/<range>.
 */
export async function GET(req: NextRequest) {
  try {
    const viewer = await resolveAgentViewerFromRequest(req)
    const { searchParams } = new URL(req.url)
    const base = agentBaseFromRequest(req)
    const format = searchParams.get("format")?.toLowerCase()
    const wantsText = format === "text" || format === "context"
    const hasRange =
      searchParams.has("range") || searchParams.has("period") || searchParams.has("from")

    if (hasRange) {
      const profile = await prisma.user.findUnique({
        where: { id: viewer.id },
        select: { timeZone: true },
      })
      const tz = resolveAgentTimezone(profile?.timeZone)
      const todayKey = agentTodayKey(new Date(), profile?.timeZone)
      const range = resolveAgentRangeFromParams(searchParams, todayKey, tz)
      if (!range) {
        return NextResponse.json(
          { error: "Unknown range.", validRanges: AGENT_RANGE_PRESETS },
          { status: 404 }
        )
      }
      const snapshot = await exportRangeForAgent(viewer.id, range)
      if (wantsText) {
        return new NextResponse(buildRangeTextReport(base, viewer.name, snapshot), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
          },
        })
      }
      return NextResponse.json(
        { ...snapshot, _meta: { profileName: viewer.name } },
        { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
      )
    }

    const payload = await exportProfileForAgent(viewer.id)

    if (wantsText) {
      const lines = [
        `# theGRID — profile export`,
        `exportedAt: ${payload.exportedAt}`,
        `profileId: ${payload.profile.id}`,
        ``,
        `--- 7-day coach snapshot ---`,
        payload.contextSummary,
        ``,
        `--- TODAY / THIS WEEK / THIS MONTH ---`,
        payload.periods.narrative,
        ``,
        `---`,
        `Full structured JSON: GET ${base}/api/agent/carlos`,
        `Any window (plain text): GET ${base}/api/agent/text/<range>`,
        `Ranges: ${AGENT_RANGE_PRESETS.map((p) => p.key).join(", ")}`,
        `Record counts: ${JSON.stringify(payload.counts)}`,
      ]
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      })
    }

    return NextResponse.json(
      {
        ...payload,
        _meta: {
          profileName: viewer.name,
          hint: "Use ?format=text for plain text, or ?range=7d (also /api/agent/json/7d) for one window.",
          ranges: AGENT_RANGE_PRESETS.map((p) => ({
            ...p,
            text: `${base}/api/agent/text/${p.key}`,
            json: `${base}/api/agent/json/${p.key}`,
          })),
        },
      },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    )
  } catch (e) {
    if (e instanceof AgentAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[api/agent/carlos]", e)
    return NextResponse.json({ error: "Failed to export profile data." }, { status: 500 })
  }
}
