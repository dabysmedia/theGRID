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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveDate } from "@/context/DateContext"
import { formatDisplayDate, parseLocalDate } from "@/lib/utils"
import { apiFetch } from "@/lib/api-fetch"

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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-log-bedtime" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span className="status-dot" style={{ width: 4, height: 4 }} />
                Bedtime
              </Label>
              <Input
                id="quick-log-bedtime"
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                className="tabular-nums text-lg tracking-widest bg-background/40 border-primary/15 focus-visible:border-primary/40 focus-visible:ring-primary/15"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-log-wake" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span className="status-dot" style={{ width: 4, height: 4 }} />
                Wake time
              </Label>
              <Input
                id="quick-log-wake"
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className="tabular-nums text-lg tracking-widest bg-background/40 border-primary/15 focus-visible:border-primary/40 focus-visible:ring-primary/15"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Quality ({quality}/5)
            </Label>
            <div className="flex gap-2 mt-1">
              {[1, 2, 3, 4, 5].map((q) => (
                <Button
                  key={q}
                  type="button"
                  variant={quality === q ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuality(q)}
                  className="w-10"
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-log-sleep-notes" className="text-xs uppercase tracking-wider text-muted-foreground">
              Notes
            </Label>
            <Input
              id="quick-log-sleep-notes"
              placeholder="How did you sleep?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

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
