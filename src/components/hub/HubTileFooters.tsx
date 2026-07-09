"use client"

import { WeekWorkoutGoalRing } from "@/components/WeekWorkoutGoalRing"
import { BowelToiletIcon } from "@/components/BowelToiletIcon"
import { PeptideVialGraphic } from "@/components/PeptideVialGraphic"
import { SleepAlarmClockGraphic } from "@/components/sleep/SleepAlarmClockGraphic"
import { CaloriePipTracker, caloriePipAccentHex } from "@/components/calories/CaloriePipTracker"
import { MeshHeartSvg } from "@/components/hub/MeshHeartSvg"
import { cn } from "@/lib/utils"
import type { NextInjectionInfo } from "@/lib/hub-tile-prefs"
import { computeTargetBedtimeParts } from "@/lib/hub-tile-prefs"
import {
  READINESS_BAND_LABEL,
  readinessBand,
} from "@/lib/readiness-score"

export function HubCalorieFooter({
  consumed,
  target,
  color = "#ef4444",
}: {
  consumed: number
  target: number
  color?: string
}) {
  const accent = caloriePipAccentHex(consumed, target)

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <div className="relative min-h-0 w-full flex-1 overflow-hidden px-0.5 pt-1">
        <CaloriePipTracker
          consumed={consumed}
          target={target}
          size="compact"
          className="h-full max-h-full"
        />
      </div>
      <div className="shrink-0 space-y-0.5 text-center">
        <div className="flex items-baseline justify-center gap-1">
          <span
            className="type-hud-value-lg tabular-nums transition-colors"
            style={{ color: target > 0 ? accent : undefined }}
          >
            {consumed.toLocaleString()}
          </span>
          <span className="type-hud-unit">cal</span>
        </div>
        {target > 0 && (
          <p className="type-hud-target-line">
            / {target.toLocaleString()} target
          </p>
        )}
        <p className="type-hud-caption-tight text-[8px]" style={{ color: `${color}99` }}>
          Today
        </p>
      </div>
    </div>
  )
}

export function HubWorkoutFooter({
  weekCount,
  color = "#c4d632",
}: {
  weekCount: number
  color?: string
}) {
  const met = weekCount >= 3
  const status =
    met ? "Goal met" : weekCount === 0 ? "Not yet" : `${weekCount} this week`

  return (
    <div className="flex w-full flex-col items-center justify-center gap-2.5 text-center">
      <WeekWorkoutGoalRing count={weekCount} size="lg" color={color} />
      <div className="space-y-0.5">
        <p className="type-hud-caption-tight text-[8px]">This week</p>
        <p
          className="text-[11px] font-semibold tabular-nums leading-tight tracking-wide"
          style={met ? { color } : undefined}
        >
          {status}
        </p>
      </div>
    </div>
  )
}

export function HubPeptideFooter({
  lastDoseMg,
  nextInjection,
  color = "#a855f7",
}: {
  lastDoseMg: number | null
  nextInjection: NextInjectionInfo | null
  color?: string
}) {
  let untilLabel = "Log first shot"
  let untilTone: "default" | "due" | "overdue" = "default"
  if (nextInjection) {
    if (nextInjection.overdue) {
      untilLabel = `${Math.abs(nextInjection.daysUntil)}d overdue`
      untilTone = "overdue"
    } else if (nextInjection.dueToday) {
      untilLabel = "Due today"
      untilTone = "due"
    } else if (nextInjection.daysUntil === 1) {
      untilLabel = "Next · tomorrow"
    } else {
      untilLabel = `${nextInjection.daysUntil}d until next`
    }
  }

  return (
    <div className="flex w-full flex-col items-center justify-center gap-2.5 text-center">
      <PeptideVialGraphic color={color} doseMg={lastDoseMg} size="lg" />
      <div className="space-y-0.5">
        <p className="type-hud-caption-tight text-[8px]">Next shot</p>
        <p
          className={cn(
            "text-[11px] font-semibold tabular-nums leading-tight tracking-wide text-foreground",
            untilTone === "overdue" && "text-negative",
            untilTone === "due" && "text-primary"
          )}
        >
          {untilLabel}
        </p>
      </div>
    </div>
  )
}

function formatBedtimeDisplay(displayTime: string) {
  const meridiemMatch = displayTime.match(/\s*(AM|PM)$/i)
  const meridiem = meridiemMatch?.[1]?.toUpperCase() ?? ""
  const timeMain = meridiem
    ? displayTime.replace(/\s*(AM|PM)$/i, "").trim()
    : displayTime
  return { timeMain, meridiem }
}

export function HubSleepBedtimeFooter({
  targetBedtime,
  desiredWakeTime,
  sleepHoursGoal,
  color = "#6366f1",
}: {
  targetBedtime: string
  desiredWakeTime: string
  sleepHoursGoal: number
  color?: string
}) {
  const parts = computeTargetBedtimeParts(desiredWakeTime, sleepHoursGoal)
  const displayTime = targetBedtime || parts.display
  const { timeMain, meridiem } = formatBedtimeDisplay(displayTime)

  const wakeFormatted = (() => {
    const [h, m] = desiredWakeTime.split(":").map(Number)
    const d = new Date(2000, 0, 1, h ?? 0, m ?? 0)
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  })()

  return (
    <div className="flex w-full flex-col items-center justify-center gap-1 text-center">
      <div className="relative w-full max-w-[10rem] overflow-visible">
        <div
          className="pointer-events-none absolute inset-x-[8%] bottom-[2%] top-[12%] rounded-full opacity-40 blur-lg"
          style={{
            background: `radial-gradient(circle at 50% 55%, ${color}55, transparent 68%)`,
          }}
          aria-hidden
        />
        <SleepAlarmClockGraphic
          timeMain={timeMain}
          meridiem={meridiem}
          className="relative z-10"
        />
      </div>
      <div className="-mt-1 space-y-0.5">
        <p className="type-hud-caption-tight text-[8px]">Target bedtime</p>
        <p className="type-hud-caption text-[9px] normal-case tabular-nums opacity-70 sm:text-[10px]">
          {wakeFormatted} wake · {sleepHoursGoal}h
        </p>
      </div>
    </div>
  )
}

export function HubBowelFooter({
  todayCount,
  goal,
  color = "#92400e",
}: {
  todayCount: number
  goal: number | null
  color?: string
}) {
  const met = goal != null && goal > 0 && todayCount >= goal
  let status = "No logs yet"
  if (todayCount === 1) status = "1 entry today"
  else if (todayCount > 1) status = `${todayCount} entries today`
  if (met) status = "Goal met"

  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 text-center">
      <BowelToiletIcon value={todayCount} color={color} size="lg" />
      <div className="space-y-0.5">
        <p className="type-hud-caption-tight text-[8px]">Today</p>
        <p
          className="text-[11px] font-semibold tabular-nums leading-tight tracking-wide"
          style={met || todayCount > 0 ? { color } : undefined}
        >
          {status}
        </p>
      </div>
    </div>
  )
}

/** Vitals system tile: mesh heart with HRV centered. */
export function HubVitalsFooter({
  hrvMs,
  readiness,
  color = "#f43f5e",
}: {
  hrvMs: number | null
  readiness?: number | null
  color?: string
}) {
  const band = readinessBand(readiness ?? null)
  const accent = color
  const hrvLabel =
    hrvMs != null && Number.isFinite(hrvMs) ? String(Math.round(hrvMs)) : "—"

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-1.5 text-center">
      <div className="relative flex h-[6.25rem] w-[6.25rem] shrink-0 items-center justify-center sm:h-[6.75rem] sm:w-[6.75rem]">
        <MeshHeartSvg
          accent={accent}
          className="absolute inset-0 h-full w-full drop-shadow-[0_0_18px_rgba(244,63,94,0.32)]"
        />
        <div className="relative z-10 flex flex-col items-center justify-center pt-0.5">
          <span
            className="font-semibold tabular-nums leading-none tracking-tight text-foreground"
            style={{
              fontSize: hrvLabel.length > 3 ? "1.2rem" : "1.55rem",
              textShadow: `0 0 18px ${accent}77`,
            }}
          >
            {hrvLabel}
          </span>
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-rose-100/70">
            ms
          </span>
        </div>
      </div>
      <div className="space-y-0.5">
        <p className="type-hud-caption-tight text-[8px]">HRV</p>
        <p
          className="text-[11px] font-semibold tabular-nums leading-tight tracking-wide"
          style={hrvMs != null || band ? { color: accent } : undefined}
        >
          {band
            ? READINESS_BAND_LABEL[band]
            : hrvMs != null
              ? "Today"
              : "Sync Fitbit"}
        </p>
      </div>
    </div>
  )
}
