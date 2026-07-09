"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { displaySleepScore, sleepScoreBand, SLEEP_SCORE_BAND_LABEL } from "@/lib/sleep-score"

const labelClass = "type-hud-label-soft"

const SCORE_BAND_COLOR: Record<string, string> = {
  excellent: "#22c55e",
  good: "#6366f1",
  fair: "#f59e0b",
  poor: "#ef4444",
}

/** Optional 0–100 sleep score input. Leave blank to let the server derive a score from duration. */
export function SleepScoreInput({
  value,
  onChange,
}: {
  value: number | null
  onChange: (value: number | null) => void
}) {
  const band = sleepScoreBand(value)
  const color = band ? SCORE_BAND_COLOR[band] : "#6366f1"

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer touch-manipulation appearance-none rounded-full bg-muted/30 accent-current"
          style={{ color }}
          aria-label="Sleep score"
        />
        <div className="flex min-w-[3.5rem] items-baseline justify-end gap-0.5">
          <span className="type-hud-stat tabular-nums" style={{ color }}>
            {displaySleepScore(value)}
          </span>
          {value != null && <span className="type-hud-caption">/100</span>}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "type-hud-micro normal-case transition-colors",
            value == null ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {value == null ? "Auto-derive from duration" : "Clear (auto-derive)"}
        </button>
        {band && (
          <span className="type-hud-caption normal-case" style={{ color }}>
            {SLEEP_SCORE_BAND_LABEL[band]}
          </span>
        )}
      </div>
    </div>
  )
}

export type SleepLogFieldsProps = {
  bedtime: string
  wakeTime: string
  score: number | null
  notes: string
  onBedtimeChange: (value: string) => void
  onWakeTimeChange: (value: string) => void
  onScoreChange: (value: number | null) => void
  onNotesChange: (value: string) => void
  idPrefix?: string
}

export function SleepLogFields({
  bedtime,
  wakeTime,
  score,
  notes,
  onBedtimeChange,
  onWakeTimeChange,
  onScoreChange,
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
            className="h-12 text-base tabular-nums tracking-wide"
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
            className="h-12 text-base tabular-nums tracking-wide"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className={labelClass}>Sleep score</Label>
        <SleepScoreInput value={score} onChange={onScoreChange} />
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
          className="h-11"
        />
      </div>
    </div>
  )
}
