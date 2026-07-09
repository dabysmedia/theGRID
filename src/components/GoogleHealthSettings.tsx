"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Link2, Link2Off, RefreshCw, Watch } from "lucide-react"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"

type Status = {
  configured: boolean
  connected: boolean
  googleAccount: string | null
  lastSyncAt: string | null
  lastSyncError: string | null
  connectedAt: string | null
}

export function GoogleHealthSettings() {
  const { user } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null)
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await apiFetch("/api/google-health/status")
      if (!res.ok) return
      setStatus((await res.json()) as Status)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const flag = searchParams.get("google_health")
    if (!flag) return
    const msg = searchParams.get("message")
    if (flag === "connected") {
      const sync = searchParams.get("sync")
      setMessage({
        kind: sync === "ok" ? "ok" : "err",
        text:
          sync === "ok"
            ? "Google Health connected. Last 30 days synced."
            : msg
              ? `Connected, but sync had an issue: ${msg}`
              : "Connected. Try Sync now.",
      })
    } else if (flag === "error") {
      setMessage({ kind: "err", text: msg || "Google Health connection failed." })
    }
    router.replace("/more", { scroll: false })
    void load()
  }, [searchParams, router, load])

  async function connect() {
    if (!user) return
    setBusy("connect")
    setMessage(null)
    try {
      const res = await apiFetch("/api/google-health/connect")
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setMessage({ kind: "err", text: data.error || "Could not start Google sign-in." })
        return
      }
      window.location.href = data.url
    } finally {
      setBusy(null)
    }
  }

  async function syncNow() {
    if (!user) return
    setBusy("sync")
    setMessage(null)
    try {
      const res = await apiFetch("/api/google-health/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        stepsUpserted?: number
        sleepUpserted?: number
        weightUpserted?: number
      }
      if (!res.ok) {
        setMessage({ kind: "err", text: data.error || "Sync failed." })
        await load()
        return
      }
      setMessage({
        kind: "ok",
        text: `Synced ${data.stepsUpserted ?? 0} step days, ${data.sleepUpserted ?? 0} sleep sessions, ${data.weightUpserted ?? 0} weigh-ins.`,
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    if (!user) return
    setBusy("disconnect")
    setMessage(null)
    try {
      const res = await apiFetch("/api/google-health/disconnect", { method: "DELETE" })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setMessage({ kind: "err", text: data.error || "Could not disconnect." })
        return
      }
      setMessage({ kind: "ok", text: "Google Health disconnected." })
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (!user) return null

  const lastSyncLabel =
    status?.lastSyncAt != null
      ? format(new Date(status.lastSyncAt), "MMM d, yyyy · h:mm a")
      : null

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-muted/15">
          <Watch className="h-4 w-4 text-muted-foreground/70" />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold tracking-wide text-foreground">
            Google Health / Fitbit
          </h3>
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            Import steps, sleep, and weight from your Fitbit account via Google Health.
            After connecting, steps and sleep refresh automatically every few minutes.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-[11px] text-muted-foreground/70">Checking connection…</p>
      ) : !status?.configured ? (
        <p className="text-[11px] leading-relaxed text-amber-500/90">
          Server is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Add them in Railway (or
          .env), then redeploy.
        </p>
      ) : status.connected ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-border/25 bg-muted/10 px-3 py-2.5">
            <p className="text-xs font-medium text-foreground">
              Connected{status.googleAccount ? ` · ${status.googleAccount}` : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/75">
              {lastSyncLabel ? `Last sync ${lastSyncLabel}` : "Not synced yet"}
            </p>
            {status.lastSyncError ? (
              <p className="mt-1 text-[11px] text-destructive/90">{status.lastSyncError}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="glass"
              size="sm"
              className="gap-1.5"
              disabled={busy != null}
              onClick={() => void syncNow()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy === "sync" ? "animate-spin" : ""}`} />
              Sync now
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              disabled={busy != null}
              onClick={() => void disconnect()}
            >
              <Link2Off className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="glass"
          size="sm"
          className="gap-1.5"
          disabled={busy != null}
          onClick={() => void connect()}
        >
          <Link2 className="h-3.5 w-3.5" />
          Connect Google Health
        </Button>
      )}

      {message ? (
        <p
          className={
            message.kind === "ok"
              ? "text-[11px] text-emerald-500/90"
              : "text-[11px] text-destructive/90"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
