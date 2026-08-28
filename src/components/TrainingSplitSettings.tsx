"use client"

import { useEffect, useState } from "react"
import { Layers, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import {
  normalizeTrainingSplit,
  TRAINING_SPLIT_DEFINITIONS,
  TRAINING_SPLITS,
  type TrainingSplit,
} from "@/lib/workouts/training-split"
import { cn } from "@/lib/utils"

export function TrainingSplitSettings() {
  const { user, refreshUsers } = useUser()
  const [selected, setSelected] = useState<TrainingSplit>("upper_lower")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    setSelected(normalizeTrainingSplit(user?.trainingSplit))
    setMessage("")
    setError("")
  }, [user?.id, user?.trainingSplit])

  if (!user) return null
  const saved = normalizeTrainingSplit(user.trainingSplit)
  const dirty = selected !== saved

  async function save() {
    if (!dirty || busy) return
    setBusy(true)
    setMessage("")
    setError("")
    try {
      const response = await apiFetch("/api/user/training-split", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingSplit: selected }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not save training split.")
      }
      await refreshUsers()
      setMessage(`${TRAINING_SPLIT_DEFINITIONS[selected].label} saved. Free-form workouts now start from this rotation.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save training split.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-foreground">Training split</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
          This controls the focus choices and exercise order when starting a free-form workout.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Training split">
        {TRAINING_SPLITS.map((split) => {
          const definition = TRAINING_SPLIT_DEFINITIONS[split]
          const active = selected === split
          return (
            <button
              key={split}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => { setSelected(split); setMessage(""); setError("") }}
              className={cn(
                "rounded-2xl border p-3.5 text-left transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                active ? "border-primary/45 bg-primary/[0.085] ring-1 ring-primary/20" : "border-border/30 bg-muted/[0.08] hover:border-border/50 hover:bg-muted/[0.13]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={cn("grid size-8 place-items-center rounded-lg border", active ? "border-primary/30 bg-primary/15 text-primary" : "border-border/30 bg-muted/15 text-muted-foreground/75")}>
                  <Layers className="size-4" aria-hidden />
                </span>
                <span className={cn("mt-1 size-4 rounded-full border p-[3px]", active ? "border-primary" : "border-muted-foreground/35")} aria-hidden>
                  <span className={cn("block size-full rounded-full", active && "bg-primary")} />
                </span>
              </div>
              <p className="mt-2.5 text-sm font-semibold text-foreground">{definition.label}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/65">{definition.description}</p>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="glass" size="sm" disabled={busy || !dirty} onClick={() => void save()}>
          <Save className="size-3.5" aria-hidden />
          {busy ? "Saving…" : "Save training split"}
        </Button>
        <span className="text-[10px] text-muted-foreground/55">Saved per profile</span>
      </div>
      {error ? <p className="text-[11px] text-destructive" role="alert">{error}</p> : null}
      {message ? <p className="text-[11px] leading-snug text-primary/90">{message}</p> : null}
    </div>
  )
}
