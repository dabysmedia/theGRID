"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarRange } from "lucide-react"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import {
  DEFAULT_WORK_CYCLE_ANCHOR,
  DEFAULT_WORK_CYCLE_PATTERN,
  getTrackingPeriod,
} from "@/lib/work-cycle"
import { stepsDayKey } from "@/lib/steps-day"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function WorkCycleSettings() {
  const { user, refreshUsers } = useUser()
  const [enabled, setEnabled] = useState(true)
  const [anchorDate, setAnchorDate] = useState(DEFAULT_WORK_CYCLE_ANCHOR)
  const [goal, setGoal] = useState(3)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!user) return
    setEnabled(user.workCycleEnabled ?? false)
    setAnchorDate(user.workCycleAnchorDate ?? DEFAULT_WORK_CYCLE_ANCHOR)
    setGoal(user.workoutGoalPerCycle ?? 3)
  }, [user])

  const preview = useMemo(
    () => getTrackingPeriod(stepsDayKey(), {
      enabled,
      anchorDate,
      length: 8,
      patternJson: JSON.stringify(DEFAULT_WORK_CYCLE_PATTERN),
      goal,
    }),
    [enabled, anchorDate, goal],
  )

  const save = useCallback(async () => {
    if (!user) return
    setBusy(true)
    setMessage("")
    try {
      const response = await apiFetch("/api/user/work-cycle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, anchorDate, goal }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Could not save rotation.")
        return
      }
      await refreshUsers()
      setMessage(enabled ? "Workout tracking now follows your 8-day rotation." : "Workout tracking now uses calendar weeks.")
    } finally {
      setBusy(false)
    }
  }, [user, enabled, anchorDate, goal, refreshUsers])

  if (!user) return null

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-muted/15">
          <CalendarRange className="h-4 w-4 text-muted-foreground/70" />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold tracking-wide text-foreground">Work rotation</h3>
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            Counts workouts and training load across Day 1, Day 2, Night 1, Night 2, then four off days.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-1" aria-label="Eight-day work rotation">
        {preview.labels.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className={`flex aspect-square items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums ${
              enabled && index === preview.dayIndex
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/30 bg-muted/10 text-muted-foreground/70"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {enabled && (
        <p className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
          Today is <span className="font-semibold text-foreground">cycle day {preview.dayNumber}</span>
          {preview.phase !== "calendar" ? ` · ${preview.phaseLabel}` : ""}.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="work-cycle-anchor" className="text-xs uppercase tracking-wider text-muted-foreground">
            Rotation day 1
          </Label>
          <Input
            id="work-cycle-anchor"
            type="date"
            value={anchorDate}
            onChange={(event) => setAnchorDate(event.target.value)}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="work-cycle-goal" className="text-xs uppercase tracking-wider text-muted-foreground">
            Workout goal
          </Label>
          <Input
            id="work-cycle-goal"
            type="number"
            min={1}
            max={14}
            value={goal}
            onChange={(event) => setGoal(Number(event.target.value))}
            disabled={busy}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="glass" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save rotation"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => setEnabled((value) => !value)}
        >
          {enabled ? "Use calendar weeks" : "Use 8-day rotation"}
        </Button>
      </div>

      {message && <p className="text-[11px] leading-snug text-muted-foreground/90">{message}</p>}
    </div>
  )
}
