"use client"

import { useEffect, useState } from "react"
import {
  CategoryLogDialog,
  CategoryLogSubmitButton,
} from "@/components/trackers/CategoryLogDialog"
import { BowelToiletIcon } from "@/components/BowelToiletIcon"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { cn, formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"

const BOWEL_COLOR = "#92400e"

const bristolLabels: Record<number, string> = {
  0: "No poop",
  1: "Hard lumps",
  2: "Lumpy sausage",
  3: "Cracked sausage",
  4: "Smooth snake",
  5: "Soft blobs",
  6: "Mushy",
  7: "Liquid",
}

export interface LogBowelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (entry?: unknown) => void
}

export function LogBowelDialog({ open, onOpenChange, onSaved }: LogBowelDialogProps) {
  const { activeDate } = useActiveDate()
  const [bristolScale, setBristolScale] = useState(4)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setBristolScale(4)
      setNotes("")
      setSubmitting(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    try {
      const res = await apiFetch("/api/bowel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          time: new Date().toISOString(),
          bristolScale,
          notes: notes || null,
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
      title="Log bowel"
      description={formatDisplayDate(parseLocalDate(activeDate))}
      accentColor={BOWEL_COLOR}
      footer={
        <CategoryLogSubmitButton form="log-bowel-form" disabled={submitting}>
          {submitting ? "Saving…" : `Log · ${bristolLabels[bristolScale]}`}
        </CategoryLogSubmitButton>
      }
    >
      <form id="log-bowel-form" onSubmit={handleSubmit} className="space-y-5">
        <div
          className="relative flex flex-col items-center overflow-hidden rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#92400e]/[0.08] px-4 py-6 text-center"
        >
          <BowelToiletIcon
            value={bristolScale === 0 ? "—" : bristolScale}
            size="md"
            className="mb-3"
          />
          <p className="font-heading text-xl font-semibold tracking-tight">
            {bristolLabels[bristolScale]}
          </p>
          <p className="type-hud-caption mt-1 normal-case text-muted-foreground/65">
            {bristolScale === 0 ? "No movement check-in" : `Bristol type ${bristolScale}`}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="type-hud-label-soft">Bristol scale</Label>
          <Button
            type="button"
            variant={bristolScale === 0 ? "default" : "outline"}
            className="h-11 w-full touch-manipulation"
            onClick={() => setBristolScale(0)}
          >
            No poop
          </Button>
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setBristolScale(s)}
                className={cn(
                  "flex h-11 items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition-colors touch-manipulation active:scale-[0.97]",
                  bristolScale === s
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border/30 bg-glass-highlight/15 text-muted-foreground hover:border-border/50",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="log-bowel-notes" className="type-hud-label-soft">
            Notes
          </Label>
          <input
            id="log-bowel-notes"
            type="text"
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-11 w-full rounded-xl border border-border/40 bg-glass-highlight/20 px-3 text-sm outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </form>
    </CategoryLogDialog>
  )
}
