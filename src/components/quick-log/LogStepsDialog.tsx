"use client"

import { useEffect, useState } from "react"
import { Footprints } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"

const STEPS_PER_MILE = 2000

function milesToSteps(miles: number): number {
  return Math.round(miles * STEPS_PER_MILE)
}

export interface LogStepsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function LogStepsDialog({ open, onOpenChange, onSaved }: LogStepsDialogProps) {
  const { activeDate } = useActiveDate()
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

  function addQuickSteps() {
    if (inputMode === "steps") {
      const n = parseInt(count, 10)
      const base = Number.isNaN(n) ? 0 : n
      setCount(String(base + 2000))
    } else {
      const n = parseFloat(count)
      const base = Number.isNaN(n) ? 0 : n
      setCount(String(Math.round((base + 1) * 100) / 100))
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
        body: JSON.stringify({ date: activeDate, count: stepsToLog }),
      })

      if (res.ok) {
        onOpenChange(false)
        onSaved?.()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const milesPreview =
    inputMode === "miles" && count.trim() !== ""
      ? milesToSteps(parseFloat(count) || 0)
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-frost max-h-[min(90dvh,640px)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain sm:p-5">
        <DialogHeader>
          <DialogTitle className="type-hud-title flex items-center gap-2 font-sans normal-case tracking-normal">
            <Footprints className="h-4 w-4 text-[#22c55e]" aria-hidden />
            Log steps
          </DialogTitle>
          <DialogDescription className="type-hud-caption normal-case">
            {formatDisplayDate(parseLocalDate(activeDate))}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Entry type
            </Label>
            <div className="flex rounded-xl border border-glass-border bg-glass-highlight/20 p-0.5">
              <button
                type="button"
                onClick={() => switchInputMode("steps")}
                className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                  inputMode === "steps"
                    ? "bg-background/80 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Steps
              </button>
              <button
                type="button"
                onClick={() => switchInputMode("miles")}
                className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                  inputMode === "miles"
                    ? "bg-background/80 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Miles
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-log-steps" className="text-xs uppercase tracking-wider text-muted-foreground">
              {inputMode === "steps" ? "Step count *" : "Distance (miles) *"}
            </Label>
            <div className="flex gap-2">
              <Input
                id="quick-log-steps"
                type="number"
                step={inputMode === "miles" ? "0.01" : "1"}
                min="0"
                placeholder={inputMode === "steps" ? "5000" : "2.5"}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="flex-1"
                required
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 px-3"
                onClick={addQuickSteps}
                title={
                  inputMode === "steps"
                    ? "Add 2,000 steps"
                    : "Add 1 mile (~2,000 steps)"
                }
              >
                {inputMode === "steps" ? "+2k" : "+1 mi"}
              </Button>
            </div>
            {inputMode === "miles" && milesPreview != null && milesPreview > 0 && (
              <p className="text-[11px] text-muted-foreground">
                ≈ {milesPreview.toLocaleString()} steps ({STEPS_PER_MILE.toLocaleString()} steps/mi)
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="glass"
            className="w-full press-scale"
            size="lg"
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Log steps"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
