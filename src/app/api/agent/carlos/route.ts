import { NextRequest, NextResponse } from "next/server"
import { AgentAccessError, authorizeAgentRequest, resolveCarlosUserId } from "@/lib/agent/access"
import { exportProfileForAgent } from "@/lib/agent/export-profile"
import { resolveSessionUserId } from "@/lib/user-session"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * Machine-readable profile export. Browser requests use the active HttpOnly
 * session; unattended agents require AGENT_API_TOKEN and an explicit profile.
 */
export async function GET(req: NextRequest) {
  try {
    const sessionUserId = await resolveSessionUserId(req)
    let profile: { id: string; name: string }
    if (sessionUserId) {
      const sessionUser = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, name: true },
      })
      if (!sessionUser) throw new AgentAccessError("Session profile not found.", 404)
      profile = sessionUser
    } else {
      authorizeAgentRequest(req)
      profile = await resolveCarlosUserId()
    }
    const payload = await exportProfileForAgent(profile.id)

    const { searchParams } = new URL(req.url)
    const format = searchParams.get("format")?.toLowerCase()

    if (format === "text" || format === "context") {
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
          profileName: profile.name,
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
    return NextResponse.json({ error: "Failed to export profile data." }, { status: 500 })
  }
}
