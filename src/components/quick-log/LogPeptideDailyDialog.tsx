"use client"

import { useEffect, useState } from "react"
import { Syringe } from "lucide-react"
import {
  CategoryLogDialog,
  CategoryLogSubmitButton,
} from "@/components/trackers/CategoryLogDialog"
import { GlassChip } from "@/components/GlassChip"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { PEPTIDE_COLOR } from "@/lib/peptides"

export interface LogPeptideDailyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (entry?: unknown) => void
  initialHunger?: number
  initialNotes?: string
  editing?: boolean
}

export function LogPeptideDailyDialog({
  open,
  onOpenChange,
  onSaved,
  initialHunger = 5,
  initialNotes = "",
  editing = false,
}: LogPeptideDailyDialogProps) {
  const { activeDate } = useActiveDate()
  const [hungerLevel, setHungerLevel] = useState(initialHunger)
  const [dailyNotes, setDailyNotes] = useState(initialNotes)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setHungerLevel(initialHunger)
      setDailyNotes(initialNotes)
      setSubmitting(false)
    }
    // Sync form when dialog opens; ignore prop identity churn while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open-only sync
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    try {
      const res = await apiFetch("/api/peptides/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          hungerLevel,
          sideEffects: [],
          notes: dailyNotes || null,
        }),
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

  return (
    <CategoryLogDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit appetite" : "Log appetite"}
      description={formatDisplayDate(parseLocalDate(activeDate))}
      icon={Syringe}
      accentColor={PEPTIDE_COLOR}
      footer={
        <CategoryLogSubmitButton form="log-peptide-daily-form" disabled={submitting}>
          {submitting
            ? "Saving…"
            : editing
              ? "Save changes"
              : `Save · hunger ${hungerLevel}/10`}
        </CategoryLogSubmitButton>
      }
    >
      <form id="log-peptide-daily-form" onSubmit={handleSubmit} className="space-y-5">
        <div
          className="relative overflow-hidden rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#94a3b8]/[0.08] px-4 py-6 text-center"
        >
          <p className="type-hud-label-soft mb-2">Hunger</p>
          <p className="font-heading text-5xl font-semibold tabular-nums tracking-tight text-foreground">
            {hungerLevel}
          </p>
          <p className="type-hud-unit mt-1">/10 · 10 = very hungry</p>
        </div>

        <div className="space-y-2">
          <Label className="type-hud-label-soft">Hunger level</Label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <GlassChip
                key={n}
                selected={hungerLevel === n}
                onClick={() => setHungerLevel(n)}
                className="min-w-10 px-0"
              >
                {n}
              </GlassChip>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="log-peptide-daily-notes" className="type-hud-label-soft">
            Notes
          </Label>
          <input
            id="log-peptide-daily-notes"
            type="text"
            placeholder="How's appetite today?"
            value={dailyNotes}
            onChange={(e) => setDailyNotes(e.target.value)}
            className="h-11 w-full rounded-xl border border-border/40 bg-glass-highlight/20 px-3 text-sm outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </form>
    </CategoryLogDialog>
  )
}
