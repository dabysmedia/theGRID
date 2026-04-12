"use client"

import { useCallback, useEffect, useState } from "react"
import { Palmtree } from "lucide-react"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import { cn, formatDate, parseLocalDate } from "@/lib/utils"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function VacationModeSettings() {
  const { user, refreshUsers } = useUser()
  const [returnDate, setReturnDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  const active = Boolean(user?.vacationResumeDate)

  useEffect(() => {
    if (!user?.vacationResumeDate) {
      setReturnDate("")
      return
    }
    setReturnDate(user.vacationResumeDate)
  }, [user?.vacationResumeDate])

  const minDate = formatDate(new Date())

  const save = useCallback(async () => {
    if (!user) return
    const s = returnDate.trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      setMessage("Pick a return date.")
      return
    }
    if (s < minDate) {
      setMessage("Return date cannot be in the past.")
      return
    }
    setBusy(true)
    setMessage("")
    try {
      const res = await apiFetch("/api/user/vacation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacationResumeDate: s }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Could not save.")
        return
      }
      await refreshUsers()
      setMessage("Vacation mode is on. Calories and weight stay paused until that date.")
    } finally {
      setBusy(false)
    }
  }, [user, returnDate, minDate, refreshUsers])

  const clearVacation = useCallback(async () => {
    if (!user) return
    setBusy(true)
    setMessage("")
    try {
      const res = await apiFetch("/api/user/vacation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacationResumeDate: null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage(typeof data.error === "string" ? data.error : "Could not clear.")
        return
      }
      await refreshUsers()
      setReturnDate("")
      setMessage("Vacation mode is off.")
    } finally {
      setBusy(false)
    }
  }, [user, refreshUsers])

  if (!user) return null

  const resumeLabel =
    user.vacationResumeDate != null && user.vacationResumeDate !== ""
      ? format(parseLocalDate(user.vacationResumeDate), "MMM d, yyyy")
      : null

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-muted/15">
          <Palmtree className="h-4 w-4 text-muted-foreground/70" />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold tracking-wide text-foreground">Vacation mode</h3>
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            Pauses calorie and weight logging until the return date. Steps, sleep, workouts, and
            everything else stay on.
          </p>
        </div>
      </div>

      {active && resumeLabel && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
          Logging resumes on <span className="font-semibold tabular-nums">{resumeLabel}</span>.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="vacation-return" className="text-xs uppercase tracking-wider text-muted-foreground">
          Return date (first day you log again)
        </Label>
        <Input
          id="vacation-return"
          type="date"
          min={minDate}
          value={returnDate}
          onChange={(e) => setReturnDate(e.target.value)}
          disabled={busy}
          className="max-w-[12rem]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="glass" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : active ? "Update" : "Turn on"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !active}
          onClick={() => void clearVacation()}
        >
          Turn off
        </Button>
      </div>

      {message && (
        <p
          className={cn(
            "text-[11px] leading-snug",
            /Pick a return|cannot be in the past|Could not/i.test(message)
              ? "text-destructive/90"
              : "text-muted-foreground/90"
          )}
        >
          {message}
        </p>
      )}
    </div>
  )
}
