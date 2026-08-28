import { NextResponse } from "next/server"
import { agentBaseFromRequest } from "@/lib/agent/base-url"
import { isPublicAgentExportEnabled } from "@/lib/agent/access"
import { AGENT_RANGE_PRESETS } from "@/lib/agent/ranges"

export const dynamic = "force-dynamic"

/** Every crawlable window, so an agent can enumerate the surface from one file. */
export async function GET(req: Request) {
  const base = agentBaseFromRequest(req)

  if (!isPublicAgentExportEnabled()) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      { headers: { "Content-Type": "application/xml; charset=utf-8" } }
    )
  }

  const now = new Date().toISOString()
  const urls = [
    `${base}/agents`,
    `${base}/llms.txt`,
    ...AGENT_RANGE_PRESETS.map((p) => `${base}/agents/${p.key}`),
    ...AGENT_RANGE_PRESETS.map((p) => `${base}/api/agent/text/${p.key}`),
    ...AGENT_RANGE_PRESETS.map((p) => `${base}/api/agent/json/${p.key}`),
    `${base}/api/agent/carlos`,
  ]

  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls.map(
      (loc) =>
        `  <url><loc>${loc}</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq></url>`
    ),
    `</urlset>`,
  ].join("\n")

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
