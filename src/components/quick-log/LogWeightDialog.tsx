"use client"

import { useEffect, useState } from "react"
import { Weight } from "lucide-react"
import {
  CategoryLogDialog,
  CategoryLogSubmitButton,
} from "@/components/trackers/CategoryLogDialog"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"

const WEIGHT_COLOR = "#22c55e"

export interface LogWeightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
  /** Prefill when editing today's entry. */
  initialValue?: string
  initialNotes?: string
  unit?: string
  editing?: boolean
  disabled?: boolean
}

export function LogWeightDialog({
  open,
  onOpenChange,
  onSaved,
  initialValue = "",
  initialNotes = "",
  unit = "lbs",
  editing = false,
  disabled = false,
}: LogWeightDialogProps) {
  const { activeDate } = useActiveDate()
  const [weight, setWeight] = useState(initialValue)
  const [notes, setNotes] = useState(initialNotes)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setWeight(initialValue)
      setNotes(initialNotes)
      setSubmitting(false)
    }
  }, [open, initialValue, initialNotes])

  const value = parseFloat(weight)
  const valid = Number.isFinite(value) && value > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (disabled || !valid || submitting) return

    setSubmitting(true)
    try {
      const res = await apiFetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          value: weight,
          notes: notes || null,
        }),
      })

      if (res.ok) {
        onOpenChange(false)
        onSaved?.()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CategoryLogDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit weight" : "Log weight"}
      description={formatDisplayDate(parseLocalDate(activeDate))}
      icon={Weight}
      accentColor={WEIGHT_COLOR}
      footer={
        <CategoryLogSubmitButton
          form="log-weight-form"
          disabled={disabled || submitting || !valid}
        >
          {submitting
            ? "Saving…"
            : editing
              ? "Save changes"
              : valid
                ? `Log ${value} ${unit}`
                : "Log weight"}
        </CategoryLogSubmitButton>
      }
    >
      <form id="log-weight-form" onSubmit={handleSubmit} className="space-y-5">
        <div
          className="relative overflow-hidden rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#22c55e]/[0.08] px-4 py-6 text-center"
        >
          <p className="type-hud-label-soft mb-2">Weight</p>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            placeholder="0.0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            autoFocus
            disabled={disabled}
            className="w-full bg-transparent text-center font-heading text-5xl font-semibold tabular-nums tracking-tight text-foreground outline-none placeholder:text-muted-foreground/25 disabled:opacity-50"
            aria-label={`Weight in ${unit}`}
          />
          <p className="type-hud-unit mt-1">{unit}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="log-weight-notes" className="type-hud-label-soft">
            Notes
          </Label>
          <input
            id="log-weight-notes"
            type="text"
            placeholder="Optional"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={disabled}
            className="h-11 w-full rounded-xl border border-border/40 bg-glass-highlight/20 px-3 text-sm outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>
      </form>
    </CategoryLogDialog>
  )
}
