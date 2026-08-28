"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, Syringe } from "lucide-react"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import { cn } from "@/lib/utils"

export function ProtocolSettings() {
  const { user, refreshUsers } = useUser()
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    setEnabled(user?.protocolEnabled ?? true)
    setMessage("")
    setError("")
  }, [user?.id, user?.protocolEnabled])

  if (!user) return null

  async function update(next: boolean) {
    if (busy || next === enabled) return
    const previous = enabled
    setEnabled(next)
    setBusy(true)
    setMessage("")
    setError("")
    try {
      const response = await apiFetch("/api/user/protocol", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not save this setting.")
      }
      await refreshUsers()
      setMessage(
        next
          ? "Protocol tools are visible for this profile."
          : "Protocol tools are hidden. Existing records were kept.",
      )
      window.dispatchEvent(new CustomEvent("grid:protocol-setting-updated"))
    } catch (caught) {
      setEnabled(previous)
      setError(caught instanceof Error ? caught.message : "Could not save this setting.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border",
              enabled
                ? "border-primary/25 bg-primary/[0.08] text-primary"
                : "border-border/30 bg-muted/10 text-muted-foreground/60",
            )}
          >
            {enabled ? <Syringe className="size-4" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">Protocol tools</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
              Show the optional Protocol tracker on the Hub for this profile. Turning it off hides the feature and preserves prior records.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Show Protocol tools"
          disabled={busy}
          onClick={() => void update(!enabled)}
          className={cn(
            "relative mt-1 h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-55",
            enabled ? "border-primary/45 bg-primary/25" : "border-border/45 bg-muted/25",
          )}
        >
          <span
            className={cn(
              "absolute top-1 size-4.5 rounded-full bg-foreground shadow-sm transition-transform",
              enabled ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>
      <p className="type-hud-caption normal-case text-muted-foreground/55">Saved per authenticated profile</p>
      {error ? <p className="text-[11px] text-destructive" role="alert">{error}</p> : null}
      {message ? <p className="text-[11px] text-primary/90" role="status">{message}</p> : null}
    </div>
  )
}
