"use client"

import { Star } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const labelClass = "text-xs uppercase tracking-wider text-muted-foreground"

export function SleepQualityPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {[1, 2, 3, 4, 5].map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onChange(q)}
          aria-label={`Quality ${q} of 5`}
          aria-pressed={value === q}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
            value >= q
              ? "border-amber-400/45 bg-amber-400/10"
              : "border-border/25 bg-background/30 hover:border-border/40"
          )}
        >
          <Star
            className={cn(
              "h-3.5 w-3.5",
              value >= q ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
            )}
          />
        </button>
      ))}
    </div>
  )
}

export type SleepLogFieldsProps = {
  bedtime: string
  wakeTime: string
  quality: number
  notes: string
  onBedtimeChange: (value: string) => void
  onWakeTimeChange: (value: string) => void
  onQualityChange: (value: number) => void
  onNotesChange: (value: string) => void
  idPrefix?: string
}

export function SleepLogFields({
  bedtime,
  wakeTime,
  quality,
  notes,
  onBedtimeChange,
  onWakeTimeChange,
  onQualityChange,
  onNotesChange,
  idPrefix = "sleep",
}: SleepLogFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-bedtime`} className={labelClass}>
            Bedtime
          </Label>
          <Input
            id={`${idPrefix}-bedtime`}
            type="time"
            value={bedtime}
            onChange={(e) => onBedtimeChange(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-wake`} className={labelClass}>
            Wake time
          </Label>
          <Input
            id={`${idPrefix}-wake`}
            type="time"
            value={wakeTime}
            onChange={(e) => onWakeTimeChange(e.target.value)}
            className="tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className={labelClass}>Quality · {quality}/5</Label>
        <SleepQualityPicker value={quality} onChange={onQualityChange} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-notes`} className={labelClass}>
          Notes
        </Label>
        <Input
          id={`${idPrefix}-notes`}
          placeholder="Optional"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </div>
    </div>
  )
}
