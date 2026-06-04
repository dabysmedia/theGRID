import { headers } from "next/headers"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"

export const metadata = {
  title: "Agent access — THEGRID",
  description: "How AI agents read Carlos profile data from theGRID",
}

export default async function AgentsPage() {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? "http"
  const base = `${proto}://${host}`

  const endpoints = [
    { label: "llms.txt (discovery)", href: `${base}/llms.txt` },
    { label: "Carlos — full JSON export", href: `${base}/api/agent/carlos` },
    { label: "Carlos — text summary", href: `${base}/api/agent/carlos?format=text` },
  ]

  return (
    <div className="space-y-8 pb-8">
      <div className="space-y-2">
        <PageHeader title="Agent access" />
        <p className="text-[11px] leading-snug text-muted-foreground/75 sm:text-xs">
          Read-only endpoints for AI assistants given a link to this site. Data is scoped to
          profile <strong className="text-foreground">Carlos</strong>.
        </p>
      </div>

      <div className="glass hud-corners space-y-4 rounded-2xl p-6 lg:max-w-lg">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/55">
          Endpoints
        </h2>
        <ul className="space-y-3 text-sm">
          {endpoints.map((e) => (
            <li key={e.href}>
              <span className="text-muted-foreground">{e.label}</span>
              <br />
              <a
                href={e.href}
                className="break-all font-mono text-xs text-primary underline-offset-2 hover:underline"
              >
                {e.href}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="glass hud-corners space-y-3 rounded-2xl p-6 lg:max-w-lg text-sm text-muted-foreground">
        <p>
          Endpoints are public — no token required. The JSON export includes every logged table
          for Carlos plus a{" "}
          <code className="rounded bg-muted/40 px-1 font-mono text-xs">contextSummary</code> field
          (recent 7-day coach snapshot).
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground/60">
        <Link href="/" className="hover:text-foreground">
          ← Back to hub
        </Link>
      </p>
    </div>
  )
}
