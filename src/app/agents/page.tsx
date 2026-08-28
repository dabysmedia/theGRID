import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AgentSnapshotView } from "@/app/agents/AgentSnapshotView"
import { loadAgentPageData } from "@/lib/agent/page-data"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Agent data — THEGRID",
  description:
    "Complete crawlable health & fitness snapshot: today's data plus week, month, year and all-time windows. No API key or JavaScript required.",
  robots: { index: true, follow: true },
}

/** Crawlable entry point: today's complete snapshot plus links to every window. */
export default async function AgentsPage() {
  const data = await loadAgentPageData("today")
  if (data.kind !== "ok") notFound()

  return (
    <AgentSnapshotView
      base={data.base}
      profileName={data.profileName}
      snapshot={data.snapshot}
      activeRange="today"
    />
  )
}
