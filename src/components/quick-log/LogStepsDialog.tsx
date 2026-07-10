"use client"

import { useEffect, useState } from "react"
import { Footprints } from "lucide-react"
import {
  CategoryLogDialog,
  CategoryLogSubmitButton,
} from "@/components/trackers/CategoryLogDialog"
import { Button } from "@/components/ui/button"
import { useActiveDate } from "@/context/DateContext"
import { cn, formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { stepsDayKey } from "@/lib/steps-day"

const STEPS_PER_MILE = 2000
const STEPS_COLOR = "#22c55e"
const QUICK_STEPS = [1000, 2000, 5000] as const
const QUICK_MILES = [0.5, 1, 2] as const

function milesToSteps(miles: number): number {
  return Math.round(miles * STEPS_PER_MILE)
}

export interface LogStepsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (entry?: unknown) => void
}

export function LogStepsDialog({ open, onOpenChange, onSaved }: LogStepsDialogProps) {
  const { activeDate, isToday } = useActiveDate()
  const logDate = isToday ? stepsDayKey(new Date()) : activeDate
  const [count, setCount] = useState("")
  const [inputMode, setInputMode] = useState<"steps" | "miles">("steps")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setCount("")
      setInputMode("steps")
      setSubmitting(false)
    }
  }, [open])

  function switchInputMode(next: "steps" | "miles") {
    if (next === inputMode) return
    const trimmed = count.trim()
    if (trimmed !== "") {
      const n = parseFloat(trimmed)
      if (!Number.isNaN(n) && n > 0) {
        if (next === "miles" && inputMode === "steps") {
          setCount(String(Math.round((n / STEPS_PER_MILE) * 100) / 100))
        } else if (next === "steps" && inputMode === "miles") {
          setCount(String(milesToSteps(n)))
        }
      }
    }
    setInputMode(next)
  }

  function addQuick(amount: number) {
    if (inputMode === "steps") {
      const n = parseInt(count, 10)
      const base = Number.isNaN(n) ? 0 : n
      setCount(String(base + amount))
    } else {
      const n = parseFloat(count)
      const base = Number.isNaN(n) ? 0 : n
      setCount(String(Math.round((base + amount) * 100) / 100))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!count || submitting) return

    const raw = parseFloat(count)
    if (Number.isNaN(raw) || raw <= 0) return

    const stepsToLog =
      inputMode === "miles" ? milesToSteps(raw) : Math.round(raw)

    setSubmitting(true)
    try {
      const res = await apiFetch("/api/steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: logDate, count: stepsToLog }),
      })

      if (res.ok) {
        const entry = await res.json().catch(() => null)
        onOpenChange(false)
        onSaved?.(entry)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const numeric = parseFloat(count)
  const valid = !Number.isNaN(numeric) && numeric > 0
  const displayValue = count.trim() === "" ? "—" : count
  const stepsPreview =
    inputMode === "miles" && valid ? milesToSteps(numeric) : null

  return (
    <CategoryLogDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log steps"
      description={formatDisplayDate(parseLocalDate(logDate))}
      icon={Footprints}
      accentColor={STEPS_COLOR}
      footer={
        <CategoryLogSubmitButton form="log-steps-form" disabled={submitting || !valid}>
          {submitting
            ? "Saving…"
            : valid
              ? `Log ${
                  inputMode === "miles"
                    ? `${milesToSteps(numeric).toLocaleString()} steps`
                    : `${Math.round(numeric).toLocaleString()} steps`
                }`
              : "Log steps"}
        </CategoryLogSubmitButton>
      }
    >
      <form id="log-steps-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="flex rounded-xl border border-glass-border bg-glass-highlight/20 p-1">
          {(
            [
              { id: "steps" as const, label: "Steps" },
              { id: "miles" as const, label: "Miles" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => switchInputMode(opt.id)}
              className={cn(
                "flex-1 rounded-lg py-2.5 text-[12px] font-semibold tracking-wide transition-colors touch-manipulation",
                inputMode === opt.id
                  ? "bg-background/90 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div
          className="relative overflow-hidden rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#22c55e]/[0.06] px-4 py-6 text-center"
        >
          <p className="type-hud-label-soft mb-2">
            {inputMode === "steps" ? "Step count" : "Distance"}
          </p>
          <input
            type="number"
            inputMode="decimal"
            step={inputMode === "miles" ? "0.01" : "1"}
            min="0"
            placeholder={inputMode === "steps" ? "0" : "0.0"}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-center font-heading text-5xl font-semibold tabular-nums tracking-tight text-foreground outline-none placeholder:text-muted-foreground/25"
            aria-label={inputMode === "steps" ? "Step count" : "Miles"}
          />
          <p className="type-hud-unit mt-1">
            {inputMode === "steps" ? "steps" : "miles"}
          </p>
          {stepsPreview != null && stepsPreview > 0 && (
            <p className="type-hud-caption mt-2 normal-case tabular-nums text-muted-foreground/70">
              ≈ {stepsPreview.toLocaleString()} steps
            </p>
          )}
          {displayValue === "—" && (
            <p className="sr-only">Enter a value</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(inputMode === "steps" ? QUICK_STEPS : QUICK_MILES).map((n) => (
            <Button
              key={n}
              type="button"
              variant="outline"
              onClick={() => addQuick(n)}
              className="h-11 rounded-xl touch-manipulation"
            >
              {inputMode === "steps" ? `+${n / 1000}k` : `+${n} mi`}
            </Button>
          ))}
        </div>
      </form>
    </CategoryLogDialog>
  )
}
