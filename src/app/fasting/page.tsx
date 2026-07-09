"use client"

import { useEffect, useMemo, useState } from "react"
import { format, subDays, startOfDay } from "date-fns"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import { Timer, Flame } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import {
  aggregateFastHoursByDay,
  loadFastLogs,
  loadFastingConfig,
  type FastLogEntry,
  type FastingConfig,
} from "@/lib/fasting"
import { CATEGORY_THEME } from "@/lib/category-theme"
import { cn, glassPanelClass } from "@/lib/utils"

const FASTING_THEME = CATEGORY_THEME.fasting
const ORANGE = FASTING_THEME.color

function BarTip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div className="glass-frost rounded-xl border border-border/40 px-2.5 py-1.5 text-[10px] font-sans tabular-nums">
      <div className="type-hud-caption">{label}</div>
      <div className="font-semibold tabular-nums">{v.toFixed(1)} h fast</div>
    </div>
  )
}

function AreaTip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: { label: string; hours: number } }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="glass-frost rounded-xl border border-border/40 px-2.5 py-1.5 text-[10px] font-sans tabular-nums">
      <div className="type-hud-caption">{p.label}</div>
      <div className="font-semibold tabular-nums">{p.hours.toFixed(1)} h fast</div>
    </div>
  )
}

function computeStreak(logs: FastLogEntry[]): number {
  const daysWith = new Set(logs.map((l) => format(new Date(l.fastEndedAt), "yyyy-MM-dd")))
  let d = startOfDay(new Date())
  if (!daysWith.has(format(d, "yyyy-MM-dd"))) {
    d = subDays(d, 1)
  }
  let streak = 0
  while (daysWith.has(format(d, "yyyy-MM-dd"))) {
    streak++
    d = subDays(d, 1)
  }
  return streak
}

export default function FastingPage() {
  const [logs, setLogs] = useState<FastLogEntry[]>([])
  const [config, setConfig] = useState<FastingConfig | null>(null)

  useEffect(() => {
    function refresh() {
      setLogs(loadFastLogs())
      setConfig(loadFastingConfig())
    }
    refresh()
    window.addEventListener("fasting-logs-changed", refresh)
    return () => window.removeEventListener("fasting-logs-changed", refresh)
  }, [])

  const last14 = useMemo(() => {
    const end = startOfDay(new Date())
    const days = Array.from({ length: 14 }, (_, i) => subDays(end, 13 - i))
    const keys = days.map((d) => format(d, "yyyy-MM-dd"))
    const byDay = aggregateFastHoursByDay(logs, keys)
    return keys.map((k, i) => ({
      key: k,
      label: format(days[i], "MMM d"),
      dow: format(days[i], "EEE"),
      hours: Math.round((byDay[k] ?? 0) * 10) / 10,
    }))
  }, [logs])

  const last30Trend = useMemo(() => {
    const end = startOfDay(new Date())
    const days = Array.from({ length: 30 }, (_, i) => subDays(end, 29 - i))
    const keys = days.map((d) => format(d, "yyyy-MM-dd"))
    const byDay = aggregateFastHoursByDay(logs, keys)
    return keys.map((k, i) => ({
      key: k,
      label: format(days[i], "MMM d"),
      hours: Math.round((byDay[k] ?? 0) * 10) / 10,
    }))
  }, [logs])

  const stats = useMemo(() => {
    const last7 = last14.slice(-7)
    const sum7 = last7.reduce((s, d) => s + d.hours, 0)
    const avg7 = last7.length ? sum7 / 7 : 0
    const planned = config?.fastHours ?? 16
    const adherence =
      last7.length && planned > 0
        ? Math.min(100, Math.round((avg7 / planned) * 100))
        : null
    return {
      avg7,
      adherence,
      total: logs.length,
      streak: computeStreak(logs),
      planned,
    }
  }, [last14, logs, config])

  const recent = useMemo(() => [...logs].reverse().slice(0, 20), [logs])

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="Fasting" />

      <PageHeroStrip
        color={ORANGE}
        icon={Timer}
        eyebrow="7-day average"
        value={stats.avg7 > 0 ? stats.avg7.toFixed(1) : "—"}
        unit={stats.avg7 > 0 ? "hrs" : undefined}
        hint={`target ${stats.planned}h`}
        metrics={[
          {
            label: "Vs target",
            value: stats.adherence != null ? `${stats.adherence}%` : "—",
          },
          { label: "Day streak", value: stats.streak > 0 ? String(stats.streak) : "—" },
          { label: "Completed", value: String(stats.total) },
        ]}
      />

      <section className={cn(glassPanelClass, "animate-fade-up stagger-1 space-y-4 p-4 lg:p-5")}>
        <div className="flex items-center gap-2">
          <Flame className="h-3.5 w-3.5" style={{ color: ORANGE }} />
          <h2 className="type-hud-rail text-foreground">Daily fast hours · 14d</h2>
        </div>
        <p className="type-hud-caption normal-case leading-relaxed text-muted-foreground/70">
          Hours from completed fasts ending on each day. The home timer logs a fast when you enter
          your eating window.
        </p>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last14} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis
                dataKey="dow"
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={28}
                domain={[0, "auto"]}
              />
              <Tooltip content={<BarTip />} cursor={{ fill: "oklch(0.82 0.18 110 / 6%)" }} />
              <Bar dataKey="hours" fill={ORANGE} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={cn(glassPanelClass, "animate-fade-up stagger-2 space-y-4 p-4 lg:p-5")}>
        <div className="flex items-center gap-2">
          <Timer className="h-3.5 w-3.5 text-primary" />
          <h2 className="type-hud-rail text-foreground">Trend · 30d</h2>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last30Trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="fastArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ORANGE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="label" hide />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={28}
                domain={[0, "auto"]}
              />
              <Tooltip content={<AreaTip />} />
              <Area
                type="monotone"
                dataKey="hours"
                stroke={ORANGE}
                strokeWidth={1.5}
                fill="url(#fastArea)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="animate-fade-up stagger-3 space-y-3">
        <h2 className="type-hud-rail px-0.5 text-muted-foreground/80">Recent fasts</h2>
        <div className={cn(glassPanelClass, "overflow-hidden")}>
          {recent.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground/70">
              No fasts logged yet. Keep the home screen open when a fasting window ends to build history here.
            </p>
          ) : (
            <ul className="divide-y divide-border/30">
              {recent.map((log) => {
                const onTarget = log.durationMinutes >= log.plannedFastHours * 60 * 0.95
                return (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-glass-highlight/15"
                  >
                    <div className="min-w-0">
                      <div className="type-hud-stat tabular-nums">
                        {(log.durationMinutes / 60).toFixed(1)}h
                        <span className="ml-2 type-hud-caption normal-case font-normal">
                          planned {log.plannedFastHours}h
                        </span>
                      </div>
                      <div className="type-hud-caption mt-1 normal-case text-muted-foreground/55">
                        Ended {format(new Date(log.fastEndedAt), "MMM d, h:mm a")}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "shrink-0 rounded-lg px-2.5 py-1 type-hud-chip",
                        onTarget
                          ? "bg-primary/15 text-primary"
                          : "bg-muted/30 text-muted-foreground",
                      )}
                    >
                      {onTarget ? "On target" : "Short"}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
