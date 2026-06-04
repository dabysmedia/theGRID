import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function buildLlmsTxt(origin: string): string {
  const base = origin.replace(/\/$/, "")
  return `# theGRID

> Tactical health & fitness tracker (calories, workouts, sleep, recovery, journal, peptides, and more).

This site exposes read-only health data (profile **los** or **carlos**, or the only profile on the server) for external AI agents. No sign-in, profile picker, or PIN.

## Data export

- **Agent page (HTML + summary, no auth):** ${base}/agents
- **JSON (all tables):** ${base}/api/agent/carlos
- **Plain-text summary (7-day coach snapshot):** ${base}/api/agent/carlos?format=text

All agent routes are public.

## In-app API (browser session)

The web app uses \`x-user-id\` on API routes after the user selects a profile. Agents should prefer \`/api/agent/carlos\` instead.

## Data included in /api/agent/carlos

Calorie entries, steps, runs, workouts, templates, sessions, sleep, peptides, goals, long goals (incl. weigh-ins), habits, saved meals, alcohol, bowel, journal, recovery, injuries, treatments, fasting profile, and coach conversations.
`
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = `${url.protocol}//${url.host}`
  return new NextResponse(buildLlmsTxt(origin), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
