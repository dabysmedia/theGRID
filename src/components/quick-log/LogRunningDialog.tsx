"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { PersonStanding, TreePine, Zap } from "lucide-react"
import {
  CategoryLogDialog,
  CategoryLogSubmitButton,
} from "@/components/trackers/CategoryLogDialog"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { cn, formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { kmToMiles, milesToKm } from "@/lib/units"

const RUN_COLOR = "#3b82f6"

function formatPaceMinutes(paceMin: number): string {
  const mins = Math.floor(paceMin)
  const secs = Math.round((paceMin - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function formatPaceMiles(distanceKm: number, durationMin: number): string {
  const mi = kmToMiles(distanceKm)
  if (mi === 0) return "-"
  return `${formatPaceMinutes(durationMin / mi)} /mi`
}

export interface LogRunningDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (entry?: unknown) => void
}

export function LogRunningDialog({ open, onOpenChange, onSaved }: LogRunningDialogProps) {
  const { activeDate } = useActiveDate()
  const [distance, setDistance] = useState("")
  const [duration, setDuration] = useState("")
  const [environment, setEnvironment] = useState<"outdoor" | "treadmill">("outdoor")
  const [notes, setNotes] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const lockRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setDistance("")
      setDuration("")
      setEnvironment("outdoor")
      setNotes("")
      setSubmitError(null)
      setSubmitting(false)
      lockRef.current = false
    }
  }, [open])

  const livePace = useMemo(() => {
    const mi = parseFloat(distance)
    const t = parseFloat(duration)
    if (!mi || !t || mi <= 0 || t <= 0) return null
    return formatPaceMiles(milesToKm(mi), t)
  }, [distance, duration])

  const mi = parseFloat(distance)
  const durationMin = Number.parseInt(String(duration).trim(), 10)
  const valid =
    Number.isFinite(mi) &&
    mi > 0 &&
    Number.isFinite(durationMin) &&
    durationMin > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lockRef.current || submitting) return
    lockRef.current = true
    setSubmitError(null)

    if (!valid) {
      setSubmitError("Enter distance and duration.")
      lockRef.current = false
      return
    }

    setSubmitting(true)
    try {
      const res = await apiFetch("/api/running", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          distance: milesToKm(mi),
          duration: durationMin,
          environment,
          notes: notes.trim() ? notes.trim() : null,
        }),
      })

      if (res.ok) {
        const entry = await res.json().catch(() => null)
        onOpenChange(false)
        onSaved?.(entry)
        return
      }

      let message = "Could not save run."
      try {
        const data = await res.json()
        if (data && typeof data.error === "string") message = data.error
      } catch {
        /* ignore */
      }
      setSubmitError(message)
    } catch {
      setSubmitError("Network error. Try again.")
    } finally {
      setSubmitting(false)
      lockRef.current = false
    }
  }

  return (
    <CategoryLogDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log run"
      description={formatDisplayDate(parseLocalDate(activeDate))}
      icon={PersonStanding}
      accentColor={RUN_COLOR}
      footer={
        <CategoryLogSubmitButton form="log-run-form" disabled={submitting || !valid}>
          {submitting
            ? "Saving…"
            : valid
              ? `Log ${mi.toFixed(1)} mi run`
              : "Log run"}
        </CategoryLogSubmitButton>
      }
    >
      <form id="log-run-form" noValidate onSubmit={handleSubmit} className="space-y-5">
        <div className="flex rounded-xl border border-glass-border bg-glass-highlight/20 p-1">
          {(
            [
              { id: "outdoor" as const, label: "Outdoor", icon: TreePine },
              { id: "treadmill" as const, label: "Treadmill", icon: Zap },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setEnvironment(opt.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12px] font-semibold tracking-wide transition-colors touch-manipulation",
                environment === opt.id
                  ? "bg-background/90 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <opt.icon className="h-3.5 w-3.5" />
              {opt.label}
            </button>
          ))}
        </div>

        <div
          className="relative overflow-hidden rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#3b82f6]/[0.08] px-4 py-5 text-center"
        >
          <p className="type-hud-label-soft mb-2">Distance</p>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            placeholder="0.0"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-center font-heading text-5xl font-semibold tabular-nums tracking-tight text-foreground outline-none placeholder:text-muted-foreground/25"
            aria-label="Distance in miles"
          />
          <p className="type-hud-unit mt-1">miles</p>
          {livePace && (
            <p className="type-hud-caption mt-2 normal-case tabular-nums text-primary">
              Pace {livePace}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="log-run-duration" className="type-hud-label-soft">
            Duration (min)
          </Label>
          <input
            id="log-run-duration"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            placeholder="30"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-12 w-full rounded-xl border border-border/40 bg-glass-highlight/20 px-3 text-base tabular-nums outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="log-run-notes" className="type-hud-label-soft">
            Notes
          </Label>
          <input
            id="log-run-notes"
            type="text"
            placeholder="How did it feel?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-11 w-full rounded-xl border border-border/40 bg-glass-highlight/20 px-3 text-sm outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {submitError && (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        )}
      </form>
    </CategoryLogDialog>
  )
}
