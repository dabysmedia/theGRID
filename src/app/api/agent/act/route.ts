import { NextRequest, NextResponse } from "next/server"
import { agentActCatalog } from "@/lib/agent/act/catalog"
import { runAgentAct } from "@/lib/agent/act/dispatch"
import { ActError } from "@/lib/agent/act/parse"
import { AgentAccessError, authorizeAgentRequest } from "@/lib/agent/access"

export const dynamic = "force-dynamic"

/** Plain-text command card. Public on purpose — it contains no profile data. */
export async function GET() {
  return new NextResponse(agentActCatalog(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}

/**
 * Token-gated read/write batch for one profile.
 * Authorization: Bearer <AGENT_API_TOKEN>
 */
export async function POST(req: NextRequest) {
  try {
    authorizeAgentRequest(req)
    const body = await req.json()
    const result = await runAgentAct(body)
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof AgentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof ActError) {
      return NextResponse.json(
        { error: error.message, ...(error.users ? { users: error.users } : {}) },
        { status: error.status },
      )
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 })
    }
    console.error("[api/agent/act]", error)
    return NextResponse.json({ error: "Failed." }, { status: 500 })
  }
}
