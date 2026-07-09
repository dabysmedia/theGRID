"use client"

import { useEffect, useState } from "react"
import { Moon } from "lucide-react"
import {
  CategoryLogDialog,
  CategoryLogSubmitButton,
} from "@/components/trackers/CategoryLogDialog"
import { SleepLogFields } from "@/components/sleep/SleepLogFields"
import { useActiveDate } from "@/context/DateContext"
import { formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { sleepDurationHours } from "@/lib/sleepDuration"

const SLEEP_COLOR = "#6366f1"

export interface LogSleepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (entry?: unknown) => void
}

export function LogSleepDialog({ open, onOpenChange, onSaved }: LogSleepDialogProps) {
  const { activeDate } = useActiveDate()
  const [bedtime, setBedtime] = useState("22:30")
  const [wakeTime, setWakeTime] = useState("06:30")
  const [quality, setQuality] = useState(3)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setBedtime("22:30")
      setWakeTime("06:30")
      setQuality(3)
      setNotes("")
      setSubmitting(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const bedDatetime = new Date(`${activeDate}T${bedtime}:00`)
    const wakeDatetime = new Date(`${activeDate}T${wakeTime}:00`)

    setSubmitting(true)
    try {
      const res = await apiFetch("/api/sleep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeDate,
          bedtime: bedDatetime.toISOString(),
          wakeTime: wakeDatetime.toISOString(),
          quality,
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

  const previewDuration = sleepDurationHours(
    new Date(`${activeDate}T${bedtime}:00`),
    new Date(`${activeDate}T${wakeTime}:00`),
  )

  return (
    <CategoryLogDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log sleep"
      description={`Last night · ${formatDisplayDate(parseLocalDate(activeDate))}`}
      icon={Moon}
      accentColor={SLEEP_COLOR}
      footer={
        <CategoryLogSubmitButton form="log-sleep-form" disabled={submitting}>
          {submitting ? "Saving…" : `Log ${previewDuration}h sleep`}
        </CategoryLogSubmitButton>
      }
    >
      <form id="log-sleep-form" onSubmit={handleSubmit} className="space-y-5">
        <div
          className="relative overflow-hidden rounded-2xl border border-border/25 bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-[#6366f1]/[0.08] px-4 py-6 text-center"
        >
          <p className="type-hud-label-soft mb-1">Duration</p>
          <p
            className="font-heading text-5xl font-semibold tabular-nums tracking-tight"
            style={{ color: SLEEP_COLOR }}
          >
            {previewDuration}
            <span className="type-hud-unit ml-1 text-2xl">h</span>
          </p>
          <p className="type-hud-caption mt-2 normal-case text-muted-foreground/65">
            Updates as you set bedtime & wake
          </p>
        </div>

        <SleepLogFields
          bedtime={bedtime}
          wakeTime={wakeTime}
          quality={quality}
          notes={notes}
          onBedtimeChange={setBedtime}
          onWakeTimeChange={setWakeTime}
          onQualityChange={setQuality}
          onNotesChange={setNotes}
          idPrefix="quick-log-sleep"
        />
      </form>
    </CategoryLogDialog>
  )
}
