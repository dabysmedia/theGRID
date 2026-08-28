import { NextResponse } from "next/server"
import { agentBaseFromRequest } from "@/lib/agent/base-url"
import { isPublicAgentExportEnabled } from "@/lib/agent/access"
import { AGENT_RANGE_PRESETS } from "@/lib/agent/ranges"

export const dynamic = "force-dynamic"

function buildLlmsTxt(origin: string): string {
  const base = origin.replace(/\/$/, "")

  if (!isPublicAgentExportEnabled()) {
    return `# theGRID

> Tactical health & fitness tracker.

The public data export is disabled on this instance. Machine access requires
\`Authorization: Bearer <AGENT_API_TOKEN>\` against ${base}/api/agent/carlos.
`
  }

  const windows = AGENT_RANGE_PRESETS.map(
    (p) => `- \`${p.key}\` — ${p.description}`
  ).join("\n")

  return `# theGRID

> Tactical health & fitness tracker for a single athlete. This file indexes a
> complete, crawlable export of the tracked data. No API key, no JavaScript, no
> browser session, no special headers — every URL below is a plain GET that
> returns the full snapshot in the response body.

## Start here

- **Today, plain text:** ${base}/api/agent/text/today
- **Today, HTML:** ${base}/agents
- **Today, JSON:** ${base}/api/agent/json/today

Plain text is the recommended format for language models: one self-describing
document per window, with the full log inline.

## Windows

Every window below is available at all three of:

- \`${base}/api/agent/text/<window>\` — plain text
- \`${base}/api/agent/json/<window>\` — structured JSON (totals + every raw row)
- \`${base}/agents/<window>\` — server-rendered HTML

${windows}

Beyond the presets, these also resolve as \`<window>\`:

- \`<N>d\` — any rolling window of 1–1825 days, e.g. \`45d\`
- \`YYYY-MM-DD\` — a single day, e.g. \`2026-08-01\`
- \`YYYY-MM-DD..YYYY-MM-DD\` — an explicit span, e.g. \`2026-01-01..2026-03-31\`

The same windows work as query parameters on the full export:
\`${base}/api/agent/carlos?range=30d\` and
\`${base}/api/agent/carlos?from=2026-01-01&to=2026-03-31\`, each with an optional
\`&format=text\`.

## Metrics included

Every snapshot is complete for its window and covers everything the app tracks:

- **Training split** — the active split and its focuses, the progressive-overload model, and the work rotation with today's cycle day and phase
- **Lift progression** — per movement: top set, estimated 1RM, all-time PR, working sets, volume, top-set load trend, and a session-by-session history. Built from completed sessions only; planned, active, and superseded sessions are excluded so abandoned workouts never count as training
- **Nutrition** — every meal with calories and protein/carbs/fat, daily totals, saved meals, recipes with ingredients
- **Steps** — daily counts, goal, per-day series
- **Runs** — distance, duration, pace, indoor/outdoor, notes
- **Cardio** — cycling, stair stepper and other sessions: minutes, distance, calories, avg HR, active-zone minutes
- **Strength workouts** — every session with per-exercise sets, weight, reps, RIR/type, volume, bodyweight, notes; plus saved routines
- **Sleep** — per-night duration, quality, bedtime and wake time
- **Vitals** — daily resting heart rate, HRV, HR min/avg/max, time in heart-rate zones and zone thresholds
- **Heart rate** — all-day ~5-minute samples with per-day and hourly rollups (raw buckets inlined for windows up to 8 days; daily rollups always present)
- **Bodyweight** — weigh-ins, trend, goal progress
- **Water** — per-day ounces
- **Habits** — definitions and every completion date
- **Journal** — dated entries with mood
- **Recovery** — daily pain, energy, mood, soreness, stress, mobility, sleep-feel and per-muscle DOMS
- **Alcohol** — drinks and standard units
- **Bowel** — Bristol scale entries
- **Peptides** — injections (compound, dose, site), daily hunger and side effects
- **Treatments** — logged recovery/rehab treatments
- **Goals & injuries** — active goals, long-term goals with entries, injury records with status and body region
- **Coach** — recent AI-coach conversation summaries

## Other endpoints

- **Full all-time dump (JSON):** ${base}/api/agent/carlos
- **Full all-time dump (plain text):** ${base}/api/agent/carlos?format=text
- **Sitemap of every crawlable URL:** ${base}/sitemap.xml
- **Crawl rules:** ${base}/robots.txt

## Conventions

- Dates are \`YYYY-MM-DD\` calendar day keys in the profile's timezone, stated in
  each response. Steps, vitals and heart-rate rows use a 5am→5am tracking day.
- Timestamps are ISO 8601 UTC.
- Weights are pounds, distances miles (runs also carry \`distanceKm\`, the stored
  value; cardio carries raw \`distanceMeters\`), energy kilocalories.
- Durations are minutes unless the field name says otherwise.
- Windows are inclusive of both endpoints.
- Data is live; responses carry a 60-second cache.

## Access

The public windows above are unauthenticated on purpose so agents can read them.
A browser with an active profile session sees that profile instead. The operator
can disable the entire public surface with \`AGENT_PUBLIC_EXPORT=0\`, after which
machine access needs \`Authorization: Bearer <AGENT_API_TOKEN>\`.
`
}

export async function GET(req: Request) {
  return new NextResponse(buildLlmsTxt(agentBaseFromRequest(req)), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
