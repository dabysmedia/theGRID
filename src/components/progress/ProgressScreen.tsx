"use client"

import { useMemo, useState } from "react"
import {
  Flame,
  Footprints,
  Moon,
  Dumbbell,
  Weight,
  Droplets,
  CheckSquare,
  NotebookPen,
  Trophy,
  Sparkles,
  Hexagon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  TRACK_META,
  type HeatmapCell,
  type ProgressSnapshot,
  type TrackKey,
} from "@/lib/grid-progress"

const TRACK_ICONS: Record<TrackKey, LucideIcon> = {
  calories: Flame,
  steps: Footprints,
  sleep: Moon,
  training: Dumbbell,
  weight: Weight,
  water: Droplets,
  habits: CheckSquare,
  journal: NotebookPen,
}

const WEEKDAY_MARKS = ["M", "", "W", "", "F", "", "S"] as const

const INTENSITY_FILL = [
  "oklch(0.48 0.012 250 / 38%)",
  "oklch(0.58 0.12 110 / 45%)",
  "oklch(0.70 0.16 110 / 70%)",
  "oklch(0.78 0.17 110 / 88%)",
  "oklch(0.86 0.18 110)",
] as const

function formatXp(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

function formatShortDate(ymd: string): string {
  const [, m, d] = ymd.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[Number(m) - 1] ?? m} ${Number(d)}`
}

export function ProgressScreen({
  snapshot,
  loading,
}: {
  snapshot: ProgressSnapshot | null
  loading: boolean
}) {
  if (loading && !snapshot) {
    return <ProgressSkeleton />
  }
  if (!snapshot) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <Hexagon className="mb-3 size-8 text-muted-foreground/40" />
        <p className="type-hud-title text-muted-foreground/70">No signal yet</p>
        <p className="mt-2 text-[12px] text-muted-foreground/55">
          Log a meal, steps, or sleep to light the grid.
        </p>
      </div>
    )
  }

  return (
    <div className="grid-progress-screen mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-5 pb-6">
      <LevelHero snapshot={snapshot} />
      <StatStrip snapshot={snapshot} />
      <TodayBoard snapshot={snapshot} />
      <HeatmapCard snapshot={snapshot} />
      <TracksCard snapshot={snapshot} />
      <MilestonesCard snapshot={snapshot} />
    </div>
  )
}

function ProgressSkeleton() {
  return (
    <div className="flex flex-1 flex-col items-center gap-5 pt-2" aria-busy aria-label="Loading progression">
      <div className="size-[8.5rem] rounded-full bg-white/[0.04] motion-safe:animate-pulse" />
      <div className="h-3 w-28 rounded-full bg-white/[0.05]" />
      <div className="grid w-full grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-[4.25rem] rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
      <div className="h-24 w-full rounded-2xl bg-white/[0.04]" />
    </div>
  )
}

function LevelHero({ snapshot }: { snapshot: ProgressSnapshot }) {
  const { level } = snapshot
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const offset = circumference - level.progress * circumference
  const remaining = Math.max(0, level.xpForNext - level.xpIntoLevel)

  return (
    <section className="grid-progress-hero relative flex flex-col items-center pt-1">
      <div
        className="pointer-events-none absolute left-1/2 top-4 h-36 w-44 -translate-x-1/2 rounded-full opacity-80"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.78 0.17 110 / 18%) 0%, transparent 70%)",
        }}
      />
      <div className="relative size-[8.75rem] motion-safe:animate-ring-pop motion-reduce:animate-none">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 112 112">
          <defs>
            <linearGradient id="grid-progress-ring" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e8f27a" />
              <stop offset="55%" stopColor="#c4d632" />
              <stop offset="100%" stopColor="#9aaa20" />
            </linearGradient>
          </defs>
          <circle
            cx="56"
            cy="56"
            r="52"
            fill="none"
            stroke="oklch(0.38 0.015 250)"
            strokeWidth="0.6"
            opacity="0.4"
          />
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke="oklch(0.32 0.01 250)"
            strokeWidth="7"
            opacity="0.35"
          />
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke="url(#grid-progress-ring)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="hub-progress-ring-arc motion-reduce:animate-none"
            style={{
              filter: "drop-shadow(0 0 10px oklch(0.78 0.17 110 / 45%))",
              // @ts-expect-error CSS custom properties
              "--ring-circumference": circumference,
              "--ring-offset": offset,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="type-hud-micro text-primary/80">Level</p>
          <p className="font-kelly-slab text-[2.15rem] leading-none tracking-tight text-foreground">
            {level.level}
          </p>
        </div>
      </div>
      <p className="mt-3 font-kelly-slab text-lg leading-none tracking-[-0.03em] text-foreground">
        {level.name}
      </p>
      <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground/70">
        {formatXp(level.xpIntoLevel)} / {formatXp(level.xpForNext)} XP
        <span className="text-muted-foreground/40"> · </span>
        {formatXp(remaining)} to {level.level + 1}
      </p>
    </section>
  )
}

function StatStrip({ snapshot }: { snapshot: ProgressSnapshot }) {
  const items = [
    {
      label: snapshot.streak.atRisk ? "At risk" : "Streak",
      value: snapshot.streak.current > 0 ? `${snapshot.streak.current}d` : "—",
      detail: snapshot.streak.atRisk ? "Log today" : "Check-ins",
      warn: snapshot.streak.atRisk,
    },
    {
      label: "Best",
      value: snapshot.streak.best > 0 ? `${snapshot.streak.best}d` : "—",
      detail: "Longest run",
      warn: false,
    },
    {
      label: "30-day",
      value: `${snapshot.consistency30}%`,
      detail: "Consistency",
      warn: false,
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item, i) => (
        <div
          key={item.label}
          className="grid-progress-card rounded-2xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2.5 text-center"
          style={{ animationDelay: `${80 + i * 70}ms` }}
        >
          <p className={cn("type-hud-micro", item.warn ? "text-orange-300/80" : undefined)}>
            {item.label}
          </p>
          <p
            className={cn(
              "mt-1 font-kelly-slab text-xl leading-none tabular-nums tracking-tight",
              item.warn ? "text-orange-200" : "text-foreground",
            )}
          >
            {item.value}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground/45">{item.detail}</p>
        </div>
      ))}
    </div>
  )
}

function TodayBoard({ snapshot }: { snapshot: ProgressSnapshot }) {
  const pct = snapshot.today.maxXp > 0 ? snapshot.today.xp / snapshot.today.maxXp : 0

  return (
    <section className="grid-progress-card rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="type-hud-title">
            {snapshot.isCurrent ? "Today" : formatShortDate(snapshot.asOf)}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground/70">{snapshot.today.cue}</p>
        </div>
        <p className="shrink-0 text-right text-[11px] tabular-nums text-primary/90">
          {snapshot.today.xp} XP
        </p>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="grid-progress-xp-bar h-full rounded-full bg-gradient-to-r from-[#9aaa20] via-[#c4d632] to-[#e8f27a]"
          style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
        />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {snapshot.today.tracks.map((track, i) => {
          const Icon = TRACK_ICONS[track.key]
          const meta = TRACK_META[track.key]
          return (
            <div
              key={track.key}
              className={cn(
                "grid-progress-chip flex flex-col items-center gap-1 rounded-xl border px-1 py-2",
                track.goalHit
                  ? "border-white/10 bg-white/[0.05]"
                  : track.logged
                    ? "border-white/[0.06] bg-white/[0.03]"
                    : "border-white/[0.04] bg-transparent opacity-55",
              )}
              style={{ animationDelay: `${120 + i * 45}ms` }}
            >
              <Icon
                className="size-3.5"
                style={{ color: track.logged ? meta.color : "oklch(0.55 0.01 250)" }}
                strokeWidth={2}
              />
              <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                {meta.label}
              </span>
              <span
                className="size-1.5 rounded-full"
                style={{
                  background: track.goalHit
                    ? meta.color
                    : track.logged
                      ? `${meta.color}66`
                      : "oklch(0.35 0.01 250 / 50%)",
                  boxShadow: track.goalHit ? `0 0 7px ${meta.color}` : undefined,
                }}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function HeatmapCard({ snapshot }: { snapshot: ProgressSnapshot }) {
  const [selected, setSelected] = useState<HeatmapCell | null>(null)
  const weeks = snapshot.heatmap
  const flat = useMemo(() => weeks.flatMap((w) => w.days), [weeks])
  const active = selected ?? flat.filter((c) => c.inRange).at(-1) ?? null

  return (
    <section className="grid-progress-card rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <p className="type-hud-title">Consistency</p>
        <p className="type-hud-eyebrow tabular-nums">{snapshot.daysLogged} days lit</p>
      </div>
      <div className="flex gap-1.5">
        <div className="flex shrink-0 flex-col justify-between py-[1px] pr-0.5">
          {WEEKDAY_MARKS.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className="h-[14px] text-[8px] leading-[14px] text-muted-foreground/40"
            >
              {label}
            </span>
          ))}
        </div>
        <div
          className="grid min-w-0 flex-1 grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateRows: "repeat(7, minmax(11px, 14px))" }}
        >
          {weeks.map((week, wi) =>
            week.days.map((cell, di) => {
              const isSelected = active?.date === cell.date
              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={!cell.inRange}
                  onClick={() => setSelected(cell)}
                  aria-label={
                    cell.inRange
                      ? `${cell.date}: ${cell.xp} XP${cell.checkIn ? ", checked in" : ""}`
                      : `${cell.date}: future`
                  }
                  className={cn(
                    "grid-progress-heat aspect-square w-full rounded-[3px] border border-white/[0.05] transition-[transform,box-shadow] duration-200",
                    cell.inRange ? "hover:scale-125" : "opacity-40",
                    isSelected && "ring-1 ring-primary/80 ring-offset-1 ring-offset-transparent",
                  )}
                  style={{
                    background: INTENSITY_FILL[cell.intensity],
                    animationDelay: `${(wi * 7 + di) * 8}ms`,
                    boxShadow: cell.perfect ? "0 0 6px oklch(0.78 0.17 110 / 55%)" : undefined,
                  }}
                />
              )
            }),
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] text-muted-foreground/65">
          {active?.inRange ? (
            <>
              <span className="tabular-nums text-foreground/80">{formatShortDate(active.date)}</span>
              <span className="text-muted-foreground/40"> · </span>
              {active.xp} XP
              {active.perfect ? " · Perfect" : active.checkIn ? " · Check-in" : " · Quiet"}
            </>
          ) : (
            "Tap a day"
          )}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40">Less</span>
          {INTENSITY_FILL.map((fill, i) => (
            <span
              key={fill}
              className="size-2 rounded-[2px]"
              style={{ background: fill, opacity: i === 0 ? 0.7 : 1 }}
            />
          ))}
          <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40">More</span>
        </div>
      </div>
    </section>
  )
}

function TracksCard({ snapshot }: { snapshot: ProgressSnapshot }) {
  return (
    <section className="grid-progress-card rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
      <p className="type-hud-title mb-3">Tracks</p>
      <ul className="space-y-2.5">
        {snapshot.tracks.map((track, i) => {
          const Icon = TRACK_ICONS[track.key]
          return (
            <li
              key={track.key}
              className="grid-progress-track"
              style={{ animationDelay: `${90 + i * 55}ms` }}
            >
              <div className="mb-1 flex items-center gap-2">
                <Icon className="size-3.5 shrink-0" style={{ color: track.color }} strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">
                  {track.label}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/55">
                  {track.streak > 0 ? `${track.streak}d` : "—"}
                  <span className="text-muted-foreground/30"> · </span>
                  {track.rate30}%
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="grid-progress-xp-bar h-full rounded-full"
                  style={{
                    width: `${track.rate30}%`,
                    background: track.color,
                    opacity: 0.85,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function MilestonesCard({ snapshot }: { snapshot: ProgressSnapshot }) {
  return (
    <section className="grid-progress-card rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
      <p className="type-hud-title mb-3">Milestones</p>
      <div className="grid grid-cols-2 gap-2">
        {snapshot.milestones.map((mile, i) => (
          <div
            key={mile.id}
            className={cn(
              "grid-progress-badge rounded-xl border px-2.5 py-2.5",
              mile.earned
                ? "border-primary/25 bg-primary/[0.07]"
                : "border-white/[0.05] bg-white/[0.02] opacity-70",
            )}
            style={{ animationDelay: `${100 + i * 50}ms` }}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              {mile.earned ? (
                <Trophy className="size-3.5 text-primary" />
              ) : (
                <Sparkles className="size-3.5 text-muted-foreground/45" />
              )}
              <p className="truncate text-[12px] font-semibold text-foreground/90">{mile.name}</p>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground/55">{mile.description}</p>
            {!mile.earned && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-white/25"
                  style={{ width: `${Math.round(mile.progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
