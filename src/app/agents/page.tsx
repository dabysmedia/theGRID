import { headers } from "next/headers"
import Link from "next/link"
import { AgentAccessError, resolveCarlosUserId } from "@/lib/agent/access"
import { exportProfileForAgent } from "@/lib/agent/export-profile"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Agent data — THEGRID",
  description: "Public health data export for AI agents (no sign-in)",
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

  return (
    <div className="space-y-6 pb-10 max-w-3xl">
      <header className="space-y-2 animate-fade-up">
        <h1 className="font-kelly-slab text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          <span className="text-gradient-glass title-underline-accent">Agent data</span>
        </h1>
        <p className="text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
          Public read-only export for <strong className="text-foreground">{profileName}</strong>.
          No profile picker or PIN on this page.
        </p>
      </header>

      <div className="glass hud-corners space-y-3 rounded-2xl p-4 text-xs sm:text-sm">
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
        <div className="glass hud-corners rounded-2xl p-6 text-sm text-red-400">{exportError}</div>
      ) : payload ? (
        <>
          <div className="glass hud-corners rounded-2xl p-4 text-xs text-muted-foreground">
            <p>
              Exported {payload.exportedAt} ·{" "}
              {Object.values(payload.counts).reduce((a, b) => a + b, 0)} total records
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
              Context summary
            </h2>
            <pre className="glass hud-corners max-h-[min(70dvh,48rem)] overflow-auto rounded-2xl p-4 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/90 sm:text-xs">
              {payload.contextSummary}
            </pre>
          </section>

          <details className="glass hud-corners rounded-2xl p-4 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              Record counts by table
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
