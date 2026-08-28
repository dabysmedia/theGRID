import "server-only"

import type { AgentRangeExport } from "@/lib/agent/export-profile"
import { AGENT_RANGE_PRESETS } from "@/lib/agent/ranges"

/**
 * The canonical plain-text snapshot an LLM crawler reads. Self-describing: it
 * states the window, the profile, and how to reach every other window, so a
 * single fetch is enough to understand and navigate the whole surface.
 */
export function buildRangeTextReport(
  base: string,
  profileName: string,
  snapshot: AgentRangeExport
): string {
  const { rollup } = snapshot
  const lines: string[] = [
    `# theGRID — ${profileName} — ${rollup.range.label}`,
    ``,
    `window: ${rollup.range.from} → ${rollup.range.to}${rollup.range.days ? ` (${rollup.range.days} day${rollup.range.days === 1 ? "" : "s"})` : " (all time)"}`,
    `timezone: ${rollup.timezone}`,
    `today: ${rollup.todayKey}`,
    `exportedAt: ${snapshot.exportedAt}`,
    `source: ${base}/api/agent/text/${rollup.range.key}`,
    ``,
    `This is a complete snapshot of every metric theGRID tracks for this window:`,
    `the active training split and work rotation, per-lift progression, nutrition,`,
    `steps, runs, cardio, strength workouts, sleep, vitals (resting HR, HRV, HR`,
    `zones), all-day heart rate, bodyweight, water, habits, journal, recovery &`,
    `DOMS, alcohol, bowel, peptides, treatments, goals and injuries.`,
    ``,
  ]

  if (snapshot.heartRateSamplesOmitted) {
    lines.push(
      `note: raw 5-minute heart-rate buckets are omitted for windows longer than a`,
      `week. Daily resting HR / HRV / min / avg / max are still included below, and`,
      `the raw buckets are available at ${base}/api/agent/text/7d.`,
      ``
    )
  }

  lines.push(
    `--- 7-DAY COACH SNAPSHOT ---`,
    snapshot.contextSummary,
    ``,
    rollup.narrative,
    ``,
    `--- OTHER WINDOWS ---`,
    ...AGENT_RANGE_PRESETS.map((p) => `${base}/api/agent/text/${p.key}  — ${p.description}`),
    `${base}/api/agent/text/2026-01-01..2026-01-31  — any explicit YYYY-MM-DD..YYYY-MM-DD window`,
    ``,
    `--- OTHER FORMATS ---`,
    `${base}/api/agent/json/<range>  — same window as structured JSON (totals + every row)`,
    `${base}/agents/<range>          — same window as HTML`,
    `${base}/api/agent/carlos        — full all-time structured dump`,
    `${base}/llms.txt                — index of this surface`,
    ``,
    `--- ALL-TIME RECORD COUNTS ---`,
    ...Object.entries(snapshot.counts).map(([k, v]) => `${k}: ${v}`),
    ``
  )

  return lines.join("\n")
}
