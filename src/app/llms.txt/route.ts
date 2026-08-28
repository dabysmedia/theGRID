import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function buildLlmsTxt(origin: string): string {
  const base = origin.replace(/\/$/, "")
  return `# theGRID

> Tactical health & fitness tracker (calories, workouts, sleep, recovery, journal, peptides, and more).

Health data is never public. Browser access follows the active authenticated profile. Unattended agent access requires a Bearer token and an explicitly configured profile.

## Data export

- **Agent page (HTML + summary, browser session required):** ${base}/agents
- **JSON (all tables):** ${base}/api/agent/carlos
- **Plain-text (today / week / month + 7-day snapshot):** ${base}/api/agent/carlos?format=text

Machine requests must send \`Authorization: Bearer <AGENT_API_TOKEN>\`. The server must also set \`AGENT_PROFILE_ID\` (preferred) or a unique \`AGENT_PROFILE_NAME\`.

## In-app API (browser session)

The web app uses a persistent HttpOnly profile session. A client-provided profile id can narrow a request but cannot override the authenticated session.

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
