import { headers } from "next/headers"
import Link from "next/link"
import { AgentAccessError, resolveCarlosUserId } from "@/lib/agent/access"
import { exportProfileForAgent } from "@/lib/agent/export-profile"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Agent data — THEGRID",
  description: "Public health data export for AI agents (no sign-in)",
}

function PeriodBlock({ title, narrative }: { title: string; narrative: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
        {title}
      </h2>
      <pre className="glass-panel max-h-[min(50dvh,36rem)] overflow-auto p-4 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/90 sm:text-xs">
        {narrative}
      </pre>
    </section>
  )
}

export default async function AgentsPage() {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? "http"
  const base = `${proto}://${host}`

  let exportError: string | null = null
  let payload: Awaited<ReturnType<typeof exportProfileForAgent>> | null = null
  let profileName = "profile"

  try {
    const profile = await resolveCarlosUserId()
    profileName = profile.name
    payload = await exportProfileForAgent(profile.id)
  } catch (e) {
    exportError =
      e instanceof AgentAccessError ? e.message : "Failed to load profile data."
  }

  const jsonUrl = `${base}/api/agent/carlos`
  const textUrl = `${base}/api/agent/carlos?format=text`
  const periods = payload?.periods

  const librarySection = periods
    ? extractPeriodSection(periods.narrative, "LIBRARY & ALL-TIME", "TODAY")
    : ""
  const contextHeader = periods ? extractNarrativeHeader(periods.narrative) : ""
  const todayNarrative = periods
    ? extractPeriodSection(periods.narrative, "TODAY", "THIS WEEK")
    : ""
  const weekNarrative = periods
    ? extractPeriodSection(periods.narrative, "THIS WEEK", "THIS MONTH")
    : ""
  const monthNarrative = periods
    ? extractPeriodSection(periods.narrative, "THIS MONTH", null)
    : ""

  return (
    <div className="space-y-6 pb-10 max-w-3xl">
      <header className="space-y-2 animate-fade-up">
        <h1 className="font-kelly-slab text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          <span className="text-gradient-glass title-underline-accent">Agent data</span>
        </h1>
        <p className="text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
          Public read-only export for <strong className="text-foreground">{profileName}</strong>.
          No profile picker or PIN. Includes <strong className="text-foreground">today</strong>,{" "}
          <strong className="text-foreground">this week</strong>, and{" "}
          <strong className="text-foreground">this month</strong> plus full history in JSON.
        </p>
      </header>

      <div className="glass-panel space-y-3 p-4 text-xs sm:text-sm">
        <p className="text-muted-foreground">Machine endpoints</p>
        <ul className="space-y-2 font-mono text-[11px] sm:text-xs break-all">
          <li>
            <a href={`${base}/llms.txt`} className="text-primary hover:underline">
              {base}/llms.txt
            </a>
          </li>
          <li>
            <a href={jsonUrl} className="text-primary hover:underline">
              {jsonUrl}
            </a>
          </li>
          <li>
            <a href={textUrl} className="text-primary hover:underline">
              {textUrl}
            </a>
          </li>
        </ul>
      </div>

      {exportError ? (
        <div className="glass-panel p-6 text-sm text-red-400">{exportError}</div>
      ) : payload && periods ? (
        <>
          <div className="glass-panel p-4 text-xs text-muted-foreground">
            <p>
              Exported {payload.exportedAt} · tz {periods.timezone} · today {periods.todayKey} ·{" "}
              {Object.values(payload.counts).reduce((a, b) => a + b, 0)} total records
            </p>
            <p className="mt-1">
              Week {periods.thisWeek.range.from} → {periods.thisWeek.range.to} · Month{" "}
              {periods.thisMonth.range.from} → {periods.thisMonth.range.to}
            </p>
          </div>

          {librarySection ? (
            <PeriodBlock title="Library & all-time (routines, meals, weight trends)" narrative={librarySection} />
          ) : null}

          {contextHeader ? (
            <section className="space-y-2">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
                Goals & status
              </h2>
              <pre className="glass-panel p-4 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/90 sm:text-xs">
                {contextHeader}
              </pre>
            </section>
          ) : null}

          <PeriodBlock title="Today" narrative={todayNarrative} />
          <PeriodBlock title="This week" narrative={weekNarrative} />
          <PeriodBlock title="This month" narrative={monthNarrative} />

          <section className="space-y-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
              7-day coach snapshot
            </h2>
            <pre className="glass-panel max-h-[min(40dvh,28rem)] overflow-auto p-4 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/90 sm:text-xs">
              {payload.contextSummary}
            </pre>
          </section>

          <details className="glass-panel p-4 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              Period totals (JSON)
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto text-[10px] font-mono">
              {JSON.stringify(
                {
                  today: periods.today.totals,
                  thisWeek: periods.thisWeek.totals,
                  thisMonth: periods.thisMonth.totals,
                },
                null,
                2
              )}
            </pre>
          </details>

          <details className="glass-panel p-4 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              All-time record counts
            </summary>
            <pre className="mt-3 overflow-auto text-[10px] font-mono">
              {JSON.stringify(payload.counts, null, 2)}
            </pre>
          </details>
        </>
      ) : null}

      <p className="text-center text-xs text-muted-foreground/60">
        <Link href="/" className="hover:text-foreground">
          ← App home (requires profile)
        </Link>
      </p>
    </div>
  )
}

function extractNarrativeHeader(full: string): string {
  const lib = full.indexOf("=== LIBRARY")
  const today = full.indexOf("=== TODAY")
  const end = lib >= 0 ? lib : today
  if (end < 0) return full.trim()
  return full.slice(0, end).trim()
}

function extractPeriodSection(
  full: string,
  startMarker: string,
  endMarker: string | null
): string {
  const startNeedle = `=== ${startMarker}`
  const start = full.indexOf(startNeedle)
  if (start < 0) return ""
  const end = endMarker ? full.indexOf(`=== ${endMarker}`, start + 1) : full.length
  return full.slice(start, end < 0 ? full.length : end).trim()
}
