"use client"

import { useEffect, useState } from "react"
import { Activity, Dumbbell, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import {
  normalizeTrainingStyle,
  TRAINING_STYLE_DEFINITIONS,
  TRAINING_STYLES,
  type TrainingStyle,
} from "@/lib/workouts/training-style"
import { cn } from "@/lib/utils"

const STYLE_DETAILS: Record<
  TrainingStyle,
  { Icon: typeof Activity; points: string[] }
> = {
  science_based: {
    Icon: Activity,
    points: ["Existing progression behavior", "Adaptive working-set volume", "8–12 reps · 2 RIR default"],
  },
  classic: {
    Icon: Dumbbell,
    points: ["2 hard sets per exercise", "Heavier 6–10 rep target", "Aim 1 RIR · failure optional"],
  },
}

export function TrainingStyleSettings() {
  const { user, refreshUsers } = useUser()
  const [selected, setSelected] = useState<TrainingStyle>("science_based")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    setSelected(normalizeTrainingStyle(user?.trainingStyle))
    setMessage("")
    setError("")
  }, [user?.id, user?.trainingStyle])

  if (!user) return null

  const saved = normalizeTrainingStyle(user.trainingStyle)
  const dirty = selected !== saved

  async function save() {
    if (busy || !dirty) return
    setBusy(true)
    setMessage("")
    setError("")
    try {
      const response = await apiFetch("/api/user/training-style", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingStyle: selected }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not save training style.")
      }
      await refreshUsers()
      setMessage(
        selected === "classic"
          ? "Classic saved. New workouts use two hard sets per exercise and near-failure guidance."
          : "Science-Based saved. Existing adaptive progression behavior is active.",
      )
      window.dispatchEvent(new CustomEvent("grid:training-style-updated"))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save training style.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-foreground">Training style</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
          Choose how the workout coach sets volume, effort, and progressive-overload targets for this profile.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Training style">
        {TRAINING_STYLES.map((style) => {
          const definition = TRAINING_STYLE_DEFINITIONS[style]
          const details = STYLE_DETAILS[style]
          const Icon = details.Icon
          const active = selected === style
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => {
                setSelected(style)
                setMessage("")
                setError("")
              }}
              className={cn(
                "min-h-44 rounded-2xl border p-4 text-left transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                active
                  ? "border-primary/45 bg-primary/[0.085] ring-1 ring-primary/20"
                  : "border-border/30 bg-muted/[0.08] hover:border-border/50 hover:bg-muted/[0.13]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl border",
                    active
                      ? "border-primary/30 bg-primary/15 text-primary"
                      : "border-border/30 bg-muted/15 text-muted-foreground/75",
                  )}
                >
                  <Icon className="size-4.5" aria-hidden />
                </div>
                <span
                  className={cn(
                    "mt-1 size-4 rounded-full border p-[3px]",
                    active ? "border-primary" : "border-muted-foreground/35",
                  )}
                  aria-hidden
                >
                  <span className={cn("block size-full rounded-full", active && "bg-primary")} />
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">{definition.label}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/65">
                {definition.description}
              </p>
              <ul className="mt-3 space-y-1.5">
                {details.points.map((point) => (
                  <li key={point} className="flex items-center gap-2 text-[10px] text-muted-foreground/80">
                    <span className={cn("size-1 rounded-full", active ? "bg-primary" : "bg-muted-foreground/45")} />
                    {point}
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      <p className="rounded-xl border border-amber-400/15 bg-amber-400/[0.045] px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground/75">
        Classic treats failure as optional, not required. Keep reps controlled and stop a set if pain appears or technique breaks down.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="glass" size="sm" disabled={busy || !dirty} onClick={() => void save()}>
          <Save className="size-3.5" aria-hidden />
          {busy ? "Saving…" : "Save training style"}
        </Button>
        <span className="text-[10px] text-muted-foreground/55">Saved per profile</span>
      </div>

      {error ? <p className="text-[11px] text-destructive" role="alert">{error}</p> : null}
      {message ? <p className="text-[11px] leading-snug text-primary/90">{message}</p> : null}
    </div>
  )
}

