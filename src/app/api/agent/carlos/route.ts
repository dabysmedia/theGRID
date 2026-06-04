import { NextRequest, NextResponse } from "next/server"
import { AgentAccessError, resolveCarlosUserId } from "@/lib/agent/access"
import { exportProfileForAgent } from "@/lib/agent/export-profile"

export const dynamic = "force-dynamic"

/**
 * Machine-readable export of all tracked data for profile Carlos.
 * Discovery: /llms.txt and /agents
 */
export async function GET(req: NextRequest) {
  try {
    const carlos = await resolveCarlosUserId()
    const payload = await exportProfileForAgent(carlos.id)

    const { searchParams } = new URL(req.url)
    const format = searchParams.get("format")?.toLowerCase()

    if (format === "text" || format === "context") {
      const lines = [
        `# theGRID — Carlos profile export`,
        `exportedAt: ${payload.exportedAt}`,
        `profileId: ${payload.profile.id}`,
        ``,
        payload.contextSummary,
        ``,
        `---`,
        `Full structured JSON: GET /api/agent/carlos`,
        `Record counts: ${JSON.stringify(payload.counts)}`,
      ]
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      })
    }

    return NextResponse.json(
      {
        ...payload,
        _meta: {
          profileName: carlos.name,
          hint: "Use ?format=text for a plain-text summary only.",
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    )
  } catch (e) {
    if (e instanceof AgentAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[api/agent/carlos]", e)
    return NextResponse.json({ error: "Failed to export Carlos profile data." }, { status: 500 })
  }
}
