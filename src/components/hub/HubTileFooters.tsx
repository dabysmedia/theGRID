"use client"

import { WeekWorkoutGoalRing } from "@/components/WeekWorkoutGoalRing"
import { BowelToiletIcon } from "@/components/BowelToiletIcon"
import { PeptideVialGraphic } from "@/components/PeptideVialGraphic"
import { CaloriePipTracker, caloriePipAccentHex } from "@/components/calories/CaloriePipTracker"
import { cn } from "@/lib/utils"
import type { NextInjectionInfo } from "@/lib/hub-tile-prefs"
import { computeTargetBedtimeParts } from "@/lib/hub-tile-prefs"

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
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        <CaloriePipTracker
          consumed={consumed}
          target={target}
          size="compact"
          className="absolute inset-0"
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
      <WeekWorkoutGoalRing count={weekCount} size="lg" />
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

function AlarmClockSvg({
  color,
  hours24,
  minutes,
  className,
}: {
  color: string
  hours24: number
  minutes: number
  className?: string
}) {
  const cx = 32
  const cy = 34
  const faceR = 22
  const hourAngle = (((hours24 % 12) + minutes / 60) * 30 - 90) * (Math.PI / 180)
  const minuteAngle = (minutes * 6 - 90) * (Math.PI / 180)
  const hourLen = faceR * 0.46
  const minuteLen = faceR * 0.66

  const hourX = cx + hourLen * Math.cos(hourAngle)
  const hourY = cy + hourLen * Math.sin(hourAngle)
  const minuteX = cx + minuteLen * Math.cos(minuteAngle)
  const minuteY = cy + minuteLen * Math.sin(minuteAngle)

  const markers = [0, 90, 180, 270].map((deg) => {
    const a = (deg - 90) * (Math.PI / 180)
    return {
      x: cx + (faceR - 4) * Math.cos(a),
      y: cy + (faceR - 4) * Math.sin(a),
    }
  })

  const gradId = `alarm-face-${color.replace("#", "")}`

  return (
    <svg viewBox="0 0 64 68" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity={0.14} />
          <stop offset="100%" stopColor={color} stopOpacity={0.03} />
        </linearGradient>
      </defs>

      <path
        d="M 21 11 Q 21 6 26 5.5 M 43 11 Q 43 6 38 5.5"
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity={0.4}
      />
      <line x1="26" y1="5.5" x2="38" y2="5.5" stroke={color} strokeWidth="1.25" opacity={0.25} />

      <circle
        cx={cx}
        cy={cy}
        r={faceR + 2.5}
        fill={`url(#${gradId})`}
        stroke={color}
        strokeWidth="1"
        opacity={0.9}
      />
      <circle
        cx={cx}
        cy={cy}
        r={faceR + 2.5}
        fill="none"
        stroke={color}
        strokeWidth="0.5"
        opacity={0.15}
      />

      {markers.map((m, i) => (
        <circle
          key={i}
          cx={m.x}
          cy={m.y}
          r={i === 0 ? 1.35 : 1}
          fill={color}
          opacity={i === 0 ? 0.75 : 0.35}
        />
      ))}

      <line
        x1={cx}
        y1={cy}
        x2={hourX}
        y2={hourY}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.75}
      />
      <line
        x1={cx}
        y1={cy}
        x2={minuteX}
        y2={minuteY}
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity={0.95}
      />
      <circle cx={cx} cy={cy} r="1.75" fill={color} opacity={0.85} />
    </svg>
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
    <div className="flex w-full flex-col items-center justify-center gap-0 text-center">
      <div className="relative flex h-[6.75rem] w-full max-w-[9rem] items-end justify-center sm:h-[7.25rem]">
        <div
          className="pointer-events-none absolute inset-x-[8%] bottom-[2%] top-[12%] rounded-full opacity-40 blur-lg"
          style={{
            background: `radial-gradient(circle at 50% 55%, ${color}55, transparent 68%)`,
          }}
          aria-hidden
        />
        <AlarmClockSvg
          color={color}
          hours24={parts.hours24}
          minutes={parts.minutes}
          className="relative z-10 h-[6.5rem] w-auto sm:h-[7rem]"
        />
      </div>
      <div className="-mt-1 space-y-1 sm:-mt-1.5">
        <p className="type-hud-caption-tight text-[9px] sm:text-[10px]">Target bedtime</p>
        <p className="text-[1.25rem] font-semibold tabular-nums leading-none tracking-tight text-foreground sm:text-[1.4rem]">
          {timeMain}
          {meridiem && (
            <span
              className="ml-1.5 text-[11px] font-medium uppercase tracking-[0.14em] sm:text-xs"
              style={{ color }}
            >
              {meridiem}
            </span>
          )}
        </p>
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
