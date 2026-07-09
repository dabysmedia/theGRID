"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { HeartPulse, RefreshCw, Waves } from "lucide-react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import { apiFetch } from "@/lib/api-fetch"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { Button } from "@/components/ui/button"
import { useActiveDate } from "@/context/DateContext"
import {
  cn,
  formatDisplayDate,
  glassPanelAccentClass,
  glassPanelAccentStyle,
  glassPanelClass,
  parseLocalDate,
} from "@/lib/utils"

const VITALS_COLOR = "#f43f5e"

type ZoneMinutes = { zone: string; minutes: number }
type ZoneThreshold = { zone: string; minBpm: number | null; maxBpm: number | null }
type HrSample = { time: string; bpm: number }
type TrendDay = {
  date: string
  restingHeartRate: number | null
  hrvMs: number | null
  hrAvg: number | null
  hrMin: number | null
  hrMax: number | null
}

interface VitalsData {
  date: string
  restingHeartRate: number | null
  hrvMs: number | null
  hrAvg: number | null
  hrMin: number | null
  hrMax: number | null
  zones: ZoneMinutes[]
  thresholds: ZoneThreshold[]
  samples: HrSample[]
  trend14: TrendDay[]
  lastSyncAt: string | null
  hasConnection: boolean
}

const emptyData: VitalsData = {
  date: "",
  restingHeartRate: null,
  hrvMs: null,
  hrAvg: null,
  hrMin: null,
  hrMax: null,
  zones: [],
  thresholds: [],
  samples: [],
  trend14: [],
  lastSyncAt: null,
  hasConnection: false,
}

const ZONE_STYLE: Record<string, { label: string; color: string }> = {
  OUT_OF_RANGE: { label: "Out of range", color: "#64748b" },
  FAT_BURN: { label: "Fat burn", color: "#22c55e" },
  CARDIO: { label: "Cardio", color: "#f59e0b" },
  PEAK: { label: "Peak", color: "#ef4444" },
}

function zoneStyle(zone: string): { label: string; color: string } {
  const key = zone.toUpperCase().replace(/[^A-Z]/g, "_")
  return (
    ZONE_STYLE[key] ?? {
      label: zone
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase()),
      color: VITALS_COLOR,
    }
  )
}

function dash(value: number | null | undefined, unit = ""): string {
  return value != null && Number.isFinite(value) ? `${value}${unit}` : "—"
}

export default function VitalsPage() {
  const { activeDate } = useActiveDate()
  const [data, setData] = useState<VitalsData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/vitals?date=${activeDate}`, { cache: "no-store" })
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      /* keep previous data */
    } finally {
      setLoading(false)
    }
  }, [activeDate])

  useEffect(() => {
    void load()
  }, [load])

  async function syncNow() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await apiFetch("/api/google-health/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 14 }),
      })
      const result = (await res.json().catch(() => ({}))) as {
        error?: string
        vitalsUpserted?: number
      }
      if (!res.ok) {
        setSyncMessage(result.error || "Sync failed. Connect Google Health in Settings first.")
      } else {
        setSyncMessage(`Synced ${result.vitalsUpserted ?? 0} days of vitals.`)
        await load()
      }
    } catch {
      setSyncMessage("Sync failed.")
    } finally {
      setSyncing(false)
    }
  }

  const hrChartData = useMemo(
    () =>
      data.samples.map((s) => ({
        label: format(new Date(s.time), "h:mm a"),
        bpm: s.bpm,
      })),
    [data.samples]
  )

  const trendChartData = useMemo(
    () =>
      data.trend14.map((d) => ({
        label: format(parseLocalDate(d.date), "MMM d"),
        rhr: d.restingHeartRate,
        hrv: d.hrvMs,
      })),
    [data.trend14]
  )

  const hasHrChart = hrChartData.length >= 2
  const hasTrend = data.trend14.some((d) => d.restingHeartRate != null || d.hrvMs != null)
  const totalZoneMinutes = data.zones.reduce((s, z) => s + z.minutes, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Vitals" />

      <PageHeroStrip
        color={VITALS_COLOR}
        icon={HeartPulse}
        eyebrow={`Resting heart rate · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={dash(data.restingHeartRate)}
        unit={data.restingHeartRate != null ? "bpm" : undefined}
        metrics={[
          { label: "HRV", value: dash(data.hrvMs, " ms") },
          { label: "Avg HR", value: dash(data.hrAvg, " bpm") },
          {
            label: "Range",
            value:
              data.hrMin != null && data.hrMax != null ? `${data.hrMin}–${data.hrMax}` : "—",
            sub: data.hrMin != null ? "bpm" : undefined,
          },
        ]}
      />

      <div
        className={cn(glassPanelClass, glassPanelAccentClass, "animate-fade-up stagger-1 p-4 lg:p-5")}
        style={glassPanelAccentStyle(VITALS_COLOR)}
      >
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="type-hud-label-soft mb-1">Google Health sync</p>
            <p className="type-hud-caption normal-case">
              {loading
                ? "Loading…"
                : data.lastSyncAt
                  ? `Last sync ${format(new Date(data.lastSyncAt), "MMM d, h:mm a")}`
                  : data.hasConnection
                    ? "Not synced yet"
                    : "Connect Google Health in Settings to import vitals"}
            </p>
            {syncMessage && (
              <p className="type-hud-caption mt-1 normal-case text-muted-foreground/80">
                {syncMessage}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="glass"
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={syncing}
            onClick={() => void syncNow()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync"}
          </Button>
        </div>
      </div>

      <section
        className={cn(glassPanelClass, glassPanelAccentClass, "animate-fade-up stagger-2 p-4 lg:p-5")}
        style={glassPanelAccentStyle(VITALS_COLOR)}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="type-hud-title flex items-center gap-1.5">
            <Waves className="h-3.5 w-3.5" style={{ color: VITALS_COLOR }} aria-hidden />
            All-day heart rate
          </h2>
          <span className="type-hud-caption tabular-nums">
            {hrChartData.length > 0 ? `${hrChartData.length} samples` : "No samples"}
          </span>
        </div>
        {!hasHrChart ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/40 bg-background/20">
            <p className="type-hud-caption normal-case text-center">
              Sync Google Health to see 5-minute heart rate samples for this day
            </p>
          </div>
        ) : (
          <div className="h-48 min-w-0 lg:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hrChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="hrAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={VITALS_COLOR} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={VITALS_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  domain={["dataMin - 5", "dataMax + 5"]}
                />
                {data.restingHeartRate != null && (
                  <ReferenceLine
                    y={data.restingHeartRate}
                    stroke="oklch(1 0 0 / 20%)"
                    strokeDasharray="4 4"
                  />
                )}
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.19 0.012 250 / 98%)",
                    border: "1px solid oklch(1 0 0 / 8%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    backdropFilter: "blur(8px)",
                  }}
                  formatter={(value) => [`${value} bpm`, "Heart rate"]}
                />
                <Area
                  type="monotone"
                  dataKey="bpm"
                  stroke={VITALS_COLOR}
                  strokeWidth={2}
                  fill="url(#hrAreaFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section
        className={cn(glassPanelClass, glassPanelAccentClass, "animate-fade-up stagger-3 p-4 lg:p-5")}
        style={glassPanelAccentStyle(VITALS_COLOR)}
      >
        <h2 className="type-hud-title mb-3">Time in heart-rate zones</h2>
        {data.zones.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border/40 bg-background/20">
            <p className="type-hud-caption normal-case text-center">
              No zone data for this day yet
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {data.zones.map((z) => {
              const style = zoneStyle(z.zone)
              const pct = totalZoneMinutes > 0 ? (z.minutes / totalZoneMinutes) * 100 : 0
              return (
                <div key={z.zone} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="type-hud-stat-sm normal-case">{style.label}</span>
                    <span className="type-hud-caption tabular-nums">{z.minutes} min</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: style.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {data.thresholds.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/20 pt-3">
            {data.thresholds.map((t) => {
              const style = zoneStyle(t.zone)
              return (
                <span
                  key={t.zone}
                  className="type-hud-micro rounded-full px-2 py-1 normal-case tabular-nums"
                  style={{ backgroundColor: `${style.color}18`, color: style.color }}
                >
                  {style.label}: {t.minBpm ?? "—"}–{t.maxBpm ?? "—"} bpm
                </span>
              )
            })}
          </div>
        )}
      </section>

      <details
        className={cn(
          glassPanelClass,
          glassPanelAccentClass,
          "animate-fade-up stagger-4 overflow-hidden"
        )}
        style={glassPanelAccentStyle(VITALS_COLOR)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-glass-highlight/10 lg:px-5 lg:py-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="type-hud-label-soft">14-day trend</p>
            <p className="type-hud-caption mt-0.5 normal-case">
              Resting heart rate &amp; HRV
            </p>
          </div>
        </summary>
        <div className="space-y-3 border-t border-border/20 px-4 pb-4 pt-3 lg:px-5 lg:pb-5">
          {!hasTrend ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/40 bg-background/20">
              <p className="type-hud-caption normal-case text-center">
                Sync at least a couple of days to see trends
              </p>
            </div>
          ) : (
            <div className="h-44 min-w-0 lg:h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="rhr"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <YAxis
                    yAxisId="hrv"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.19 0.012 250 / 98%)",
                      border: "1px solid oklch(1 0 0 / 8%)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      backdropFilter: "blur(8px)",
                    }}
                  />
                  <Line
                    yAxisId="rhr"
                    type="monotone"
                    dataKey="rhr"
                    name="RHR (bpm)"
                    stroke={VITALS_COLOR}
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="hrv"
                    type="monotone"
                    dataKey="hrv"
                    name="HRV (ms)"
                    stroke="oklch(0.82 0.18 110)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
