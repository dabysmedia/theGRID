"use client"

import { format } from "date-fns"
import { cn } from "@/lib/utils"

export type SleepStageSegment = { type: string; startTime: string; endTime: string }

export type SleepStageMinutes = {
  remMinutes?: number | null
  lightMinutes?: number | null
  deepMinutes?: number | null
  awakeMinutes?: number | null
}

export const STAGE_STYLE: Record<string, { label: string; color: string }> = {
  AWAKE: { label: "Awake", color: "#f59e0b" },
  LIGHT: { label: "Light", color: "#818cf8" },
  DEEP: { label: "Deep", color: "#4338ca" },
  REM: { label: "REM", color: "#2dd4bf" },
}

export function parseStages(json: string | null | undefined): SleepStageSegment[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Horizontal stage timeline for one night — proportional segments in chronological order. */
export function StageTimeline({
  stages,
  className,
}: {
  stages: SleepStageSegment[]
  className?: string
}) {
  if (stages.length === 0) return null
  const start = new Date(stages[0].startTime).getTime()
  const end = new Date(stages[stages.length - 1].endTime).getTime()
  const total = end - start
  if (!Number.isFinite(total) || total <= 0) return null

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/20">
        {stages.map((s, i) => {
          const segStart = new Date(s.startTime).getTime()
          const segEnd = new Date(s.endTime).getTime()
          const width = Math.max(((segEnd - segStart) / total) * 100, 0.4)
          const style = STAGE_STYLE[s.type.toUpperCase()] ?? { label: s.type, color: "#94a3b8" }
          return (
            <div
              key={i}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${width}%`, backgroundColor: style.color }}
              title={`${style.label} · ${format(new Date(s.startTime), "h:mm a")}`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {Object.entries(STAGE_STYLE).map(([key, style]) => (
          <span
            key={key}
            className="flex items-center gap-1 type-hud-micro normal-case text-muted-foreground/75"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: style.color }}
            />
            {style.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** REM / light / deep / awake minute bars for one night. */
export function StageMinuteBars({
  entry,
  className,
}: {
  entry: SleepStageMinutes
  className?: string
}) {
  const rows: Array<{ key: string; minutes: number }> = [
    { key: "REM", minutes: entry.remMinutes ?? 0 },
    { key: "LIGHT", minutes: entry.lightMinutes ?? 0 },
    { key: "DEEP", minutes: entry.deepMinutes ?? 0 },
    { key: "AWAKE", minutes: entry.awakeMinutes ?? 0 },
  ]
  const total = rows.reduce((s, r) => s + r.minutes, 0)
  if (total <= 0) return null

  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-4", className)}>
      {rows.map((r) => {
        const style = STAGE_STYLE[r.key]
        const hours = Math.round((r.minutes / 60) * 10) / 10
        const pct = total > 0 ? (r.minutes / total) * 100 : 0
        return (
          <div key={r.key} className="glass-subtle min-w-0 rounded-xl p-2.5">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: style.color }}
              />
              <span className="type-hud-caption-tight truncate">{style.label}</span>
            </div>
            <p className="type-hud-stat-sm mt-1 tabular-nums" style={{ color: style.color }}>
              {hours}h
            </p>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/25">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: style.color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
