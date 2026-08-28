import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { AgentSnapshotView } from "@/app/agents/AgentSnapshotView"
import { loadAgentPageData } from "@/lib/agent/page-data"
import { AGENT_RANGE_PRESETS } from "@/lib/agent/ranges"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ range: string }>
}): Promise<Metadata> {
  const { range } = await params
  const preset = AGENT_RANGE_PRESETS.find((p) => p.key === range)
  return {
    title: `${preset?.label ?? range} — Agent data — THEGRID`,
    description:
      preset?.description ??
      `Complete health & fitness snapshot for the ${range} window — every tracked metric, no API key required.`,
    robots: { index: true, follow: true },
  }
}

export default async function AgentRangePage({
  params,
}: {
  params: Promise<{ range: string }>
}) {
  const { range } = await params
  const data = await loadAgentPageData(range)
  // Redirect rather than 404 so crawlers that guess a slug land on the index
  // (which lists every valid window) instead of a soft-404 dead end.
  if (data.kind === "unknown-range") redirect("/agents")
  if (data.kind !== "ok") notFound()

  return (
    <AgentSnapshotView
      base={data.base}
      profileName={data.profileName}
      snapshot={data.snapshot}
      activeRange={data.range.key}
    />
  )
}
