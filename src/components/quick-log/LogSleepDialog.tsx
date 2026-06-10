"use client"

import { useEffect, useState } from "react"
import { Moon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SleepLogFields } from "@/components/sleep/SleepLogFields"
import { useActiveDate } from "@/context/DateContext"
import { formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"
import { sleepDurationHours } from "@/lib/sleepDuration"

export interface LogSleepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
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
        onOpenChange(false)
        onSaved?.()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const previewDuration = sleepDurationHours(
    new Date(`${activeDate}T${bedtime}:00`),
    new Date(`${activeDate}T${wakeTime}:00`)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-frost max-h-[min(90dvh,720px)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain sm:p-5">
        <DialogHeader>
          <DialogTitle className="type-hud-title flex items-center gap-2 font-sans normal-case tracking-normal">
            <Moon className="h-4 w-4 text-[#6366f1]" aria-hidden />
            Log sleep
          </DialogTitle>
          <DialogDescription className="type-hud-caption normal-case">
            Last night · {formatDisplayDate(parseLocalDate(activeDate))}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-center text-[11px] text-muted-foreground tabular-nums lg:text-left">
            ≈ {previewDuration}h sleep
          </p>

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

          <Button
            type="submit"
            variant="glass"
            className="w-full press-scale"
            size="lg"
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Log sleep"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
