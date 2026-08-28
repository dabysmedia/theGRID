import Link from "next/link"
import type { AgentRangeExport } from "@/lib/agent/export-profile"
import { AGENT_RANGE_PRESETS } from "@/lib/agent/ranges"

/**
 * Server-rendered snapshot shared by /agents and /agents/[range]. Everything a
 * crawler needs is in the initial HTML — no client JS, no fetch, no auth.
 */
export function AgentSnapshotView({
  base,
  profileName,
  snapshot,
  activeRange,
}: {
  base: string
  profileName: string
  snapshot: AgentRangeExport
  activeRange: string
}) {
  const { rollup } = snapshot
  const totalRecords = Object.values(snapshot.counts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6 pb-10 max-w-3xl">
      <header className="space-y-2">
        <h1 className="font-kelly-slab text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          <span className="text-gradient-glass title-underline-accent">
            {profileName} — {rollup.range.label}
          </span>
        </h1>
        <p className="text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
          Complete read-only health &amp; fitness snapshot for{" "}
          <strong className="text-foreground">
            {rollup.range.from} → {rollup.range.to}
          </strong>
          {rollup.range.days ? ` (${rollup.range.days} day${rollup.range.days === 1 ? "" : "s"})` : " (all time)"}.
          Timezone {rollup.timezone}; today is {rollup.todayKey}. Every metric theGRID tracks is
          included: nutrition, steps, runs, cardio, strength workouts, sleep, vitals, heart rate,
          bodyweight, water, habits, journal, recovery, alcohol, bowel, peptides, treatments, goals
          and injuries.
        </p>
      </header>

      <nav aria-label="Snapshot windows" className="glass-panel space-y-2 p-4 text-xs sm:text-sm">
        <p className="text-muted-foreground">Windows</p>
        <ul className="flex flex-wrap gap-2">
          {AGENT_RANGE_PRESETS.map((p) => (
            <li key={p.key}>
              <Link
                href={`/agents/${p.key}`}
                title={p.description}
                aria-current={p.key === activeRange ? "page" : undefined}
                className={
                  p.key === activeRange
                    ? "rounded-full bg-primary/15 px-3 py-1 font-mono text-[11px] text-primary ring-1 ring-primary/40"
                    : "rounded-full px-3 py-1 font-mono text-[11px] text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
                }
              >
                {p.key}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground/70">
          Any rolling window (<code>/agents/45d</code>), any single day (
          <code>/agents/2026-08-01</code>), or any explicit span (
          <code>/agents/2026-01-01..2026-03-31</code>) also resolves.
        </p>
      </nav>

      <div className="glass-panel space-y-2 p-4 text-xs sm:text-sm">
        <p className="text-muted-foreground">Machine endpoints for this window</p>
        <ul className="space-y-1 font-mono text-[11px] break-all sm:text-xs">
          <li>
            <a href={`${base}/api/agent/text/${rollup.range.key}`} className="text-primary hover:underline">
              {base}/api/agent/text/{rollup.range.key}
            </a>{" "}
            <span className="text-muted-foreground/70">— plain text</span>
          </li>
          <li>
            <a href={`${base}/api/agent/json/${rollup.range.key}`} className="text-primary hover:underline">
              {base}/api/agent/json/{rollup.range.key}
            </a>{" "}
            <span className="text-muted-foreground/70">— structured JSON</span>
          </li>
          <li>
            <a href={`${base}/api/agent/carlos`} className="text-primary hover:underline">
              {base}/api/agent/carlos
            </a>{" "}
            <span className="text-muted-foreground/70">— full all-time dump</span>
          </li>
          <li>
            <a href={`${base}/llms.txt`} className="text-primary hover:underline">
              {base}/llms.txt
            </a>{" "}
            <span className="text-muted-foreground/70">— index of this surface</span>
          </li>
        </ul>
      </div>

      <div className="glass-panel p-4 text-xs text-muted-foreground">
        <p>
          Exported {snapshot.exportedAt} · {totalRecords} total records across all time
        </p>
        {snapshot.heartRateSamplesOmitted ? (
          <p className="mt-1">
            Raw 5-minute heart-rate buckets are omitted beyond a week; daily resting HR, HRV and
            min/avg/max are still below.{" "}
            <Link href="/agents/7d" className="text-primary hover:underline">
              See /agents/7d
            </Link>{" "}
            for the raw buckets.
          </p>
        ) : null}
      </div>

      <Block title={`${rollup.range.label} — full log`} body={rollup.narrative} />
      <Block title="7-day coach snapshot" body={snapshot.contextSummary} />

      <details className="glass-panel p-4 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Window totals (JSON)
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto text-[10px] font-mono">
          {JSON.stringify(rollup.totals, null, 2)}
        </pre>
      </details>

      <details className="glass-panel p-4 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Window entries — every raw row (JSON)
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto text-[10px] font-mono">
          {JSON.stringify(rollup.entries, null, 2)}
        </pre>
      </details>

      <details className="glass-panel p-4 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Library &amp; all-time catalog (JSON)
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto text-[10px] font-mono">
          {JSON.stringify(rollup.catalog, null, 2)}
        </pre>
      </details>

      <details className="glass-panel p-4 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          All-time record counts
        </summary>
        <pre className="mt-3 overflow-auto text-[10px] font-mono">
          {JSON.stringify(snapshot.counts, null, 2)}
        </pre>
      </details>

      <p className="text-center text-xs text-muted-foreground/60">
        <Link href="/" className="hover:text-foreground">
          ← App home (requires profile)
        </Link>
      </p>
    </div>
  )
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
        {title}
      </h2>
      <pre className="glass-panel max-h-[min(60dvh,44rem)] overflow-auto p-4 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/90 sm:text-xs">
        {body}
      </pre>
    </section>
  )
}
