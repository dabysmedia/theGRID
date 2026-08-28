import { NextResponse } from "next/server"
import { agentBaseFromRequest } from "@/lib/agent/base-url"
import { isPublicAgentExportEnabled } from "@/lib/agent/access"

export const dynamic = "force-dynamic"

/**
 * Opens the agent read surface to crawlers and keeps the interactive app and
 * its authenticated APIs out of the index. Longest-match wins in every major
 * crawler, so the /api/agent/ allow overrides the broader /api/ disallow.
 * When AGENT_PUBLIC_EXPORT is off, nothing is crawlable.
 */
export async function GET(req: Request) {
  const base = agentBaseFromRequest(req)

  const body = isPublicAgentExportEnabled()
    ? `# theGRID — the crawlable surface is the agent data export.
# Start at ${base}/llms.txt for an index of every window and format.

User-agent: *
Allow: /agents
Allow: /api/agent/
Allow: /llms.txt
Allow: /sitemap.xml
Disallow: /api/
Disallow: /uploads/

Sitemap: ${base}/sitemap.xml
`
    : `# Public agent export is disabled (AGENT_PUBLIC_EXPORT=0).
User-agent: *
Disallow: /
`

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
