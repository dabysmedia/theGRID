"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { format, subDays } from "date-fns"
import { Calendar, Gauge, Syringe, Trash2, TrendingUp } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useActiveDate } from "@/context/DateContext"
import { apiFetch } from "@/lib/api-fetch"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
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
import { formatDate, formatDisplayDate, last7Days, parseLocalDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { utcCalendarDayKeyFromIso } from "@/lib/dateStorage"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"
import { HistoryArchivedNote, HistoryEarlierSection } from "@/components/HistoryEarlierSection"
import { partitionHistoryDayGroups } from "@/lib/history-display"
import {
  COMPOUNDS,
  DOSE_PRESETS_MG,
  INJECTION_SITE_REGIONS,
  INJECTION_SITES,
  PEPTIDE_COLOR,
  SIDE_EFFECTS,
  compoundLabel,
  daysSinceLastInjection,
  injectionSiteLabel,
  parseSideEffectsJson,
  sideEffectLabel,
} from "@/lib/peptides"

const peptideGoalPresets: GoalPreset[] = [
  { type: "weekly", label: "Weekly Injections", unit: "doses", placeholder: "1" },
]

const PURPLE = PEPTIDE_COLOR

const tooltipStyle = {
  background: "oklch(0.19 0.012 250 / 98%)",
  border: "1px solid oklch(1 0 0 / 8%)",
  borderRadius: "8px",
  fontSize: "12px",
  backdropFilter: "blur(8px)",
} as const

interface PeptideEntry {
  id: string
  date: string
  injectedAt: string
  compound: string
  doseMg: number
  injectionSite: string
  sideEffectsJson: string
  notes: string | null
}

interface PeptideDailyEntry {
  id: string
  date: string
  hungerLevel: number
  sideEffectsJson: string
  notes: string | null
}

function entryDateKey(entry: { date: string }): string {
  return utcCalendarDayKeyFromIso(entry.date)
}


function SectionRail({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="hud-divider flex-1" />
      <span className="type-hud-rail shrink-0">{label}</span>
      <div className="hud-divider flex-1" />
    </div>
  )
}

function GlassChip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <Button
      type="button"
      variant={selected ? "glass" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn(
        "type-hud-chip font-sans normal-case tracking-normal",
        !selected && "border-border/50 bg-background/30 text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </Button>
  )
}

function PeptideHistoryDayGroup({
  dateKey,
  items,
  showDayHeader,
  onDelete,
}: {
  dateKey: string
  items: PeptideEntry[]
  showDayHeader: boolean
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      {showDayHeader && (
        <div className="flex items-center gap-2 px-1 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="type-hud-label">
            {format(parseLocalDate(dateKey), "EEEE, MMM d, yyyy")}
          </span>
        </div>
      )}
      <div className="space-y-2">
        {items.map((entry) => {
          const effects = parseSideEffectsJson(entry.sideEffectsJson)
          return (
            <div
              key={entry.id}
              className="glass-subtle rounded-xl p-3.5 flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex items-center justify-center w-11 h-11 rounded-xl border border-primary/25 bg-gradient-to-b from-primary/15 via-primary/6 to-transparent shrink-0">
                  <span className="text-lg font-bold tabular-nums text-primary">
                    {entry.doseMg}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug">
                        {entry.doseMg} mg · {compoundLabel(entry.compound)}
                      </p>
                      <p className="type-hud-caption mt-0.5 normal-case">
                        {injectionSiteLabel(entry.injectionSite)}
                      </p>
                    </div>
                    <time
                      dateTime={entry.injectedAt}
                      className="type-hud-readout text-muted-foreground shrink-0 pt-0.5"
                    >
                      {format(new Date(entry.injectedAt), "p")}
                    </time>
                  </div>
                  {effects.length > 0 && (
                    <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                      {effects.map(sideEffectLabel).join(" · ")}
                    </p>
                  )}
                  {entry.notes && (
                    <p className="text-xs text-muted-foreground/70 mt-1">{entry.notes}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDelete(entry.id)}
                className="history-row-delete"
                aria-label="Delete entry"
              >
                <Trash2 />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PeptidesPage() {
  const [entries, setEntries] = useState<PeptideEntry[]>([])
  const [dailyEntries, setDailyEntries] = useState<PeptideDailyEntry[]>([])
  const [compound, setCompound] = useState("retatrutide")
  const [doseMg, setDoseMg] = useState(4)
  const [customDose, setCustomDose] = useState("")
  const [injectionSite, setInjectionSite] = useState("abdomen_upper_right")
  const [siteRegion, setSiteRegion] = useState("abdomen")
  const [hungerLevel, setHungerLevel] = useState(5)
  const [dailyNotes, setDailyNotes] = useState("")
  const [dailySideEffects, setDailySideEffects] = useState<string[]>([])
  const [injectionSideEffects, setInjectionSideEffects] = useState<string[]>([])
  const [injectionTime, setInjectionTime] = useState(() => format(new Date(), "HH:mm"))
  const [injectionNotes, setInjectionNotes] = useState("")
  const [injectionOpen, setInjectionOpen] = useState(false)

  const { activeDate } = useActiveDate()
  const today = activeDate

  const chartFrom = formatDate(subDays(parseLocalDate(activeDate), 29))

  useEffect(() => {
    apiFetch("/api/peptides")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  useEffect(() => {
    apiFetch(`/api/peptides/daily?from=${chartFrom}&to=${activeDate}`)
      .then(async (r) => {
        const data = await r.json()
        setDailyEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setDailyEntries([]))
  }, [chartFrom, activeDate])

  const dailyByDate = useMemo(() => {
    const map = new Map<string, PeptideDailyEntry>()
    for (const d of dailyEntries) {
      map.set(entryDateKey(d), d)
    }
    return map
  }, [dailyEntries])

  useEffect(() => {
    const row = dailyByDate.get(activeDate)
    if (row) {
      setHungerLevel(row.hungerLevel)
      setDailyNotes(row.notes ?? "")
      setDailySideEffects(parseSideEffectsJson(row.sideEffectsJson))
    } else {
      setHungerLevel(5)
      setDailyNotes("")
      setDailySideEffects([])
    }
  }, [activeDate, dailyByDate])

  const lastInjection = entries[0] ?? null
  const lastSiteUsed = lastInjection?.injectionSite ?? null
  const activeDayDaily = dailyByDate.get(activeDate) ?? null
  const activeDayHunger = activeDayDaily?.hungerLevel ?? null
  const activeDayEffects = activeDayDaily
    ? parseSideEffectsJson(activeDayDaily.sideEffectsJson)
    : []

  const { weekDoses, avgHungerStr, daysSinceStr, lastDoseMg, doseChartData, hungerChartData } =
    useMemo(() => {
      const weekKeys = new Set(last7Days().map((d) => formatDate(d)))
      const weekInjections = entries.filter((e) => weekKeys.has(entryDateKey(e)))
      const weekDoses = weekInjections.length

      const weekDaily = dailyEntries.filter((e) => weekKeys.has(entryDateKey(e)))
      let avgHungerStr = "—"
      if (weekDaily.length > 0) {
        const avg = weekDaily.reduce((acc, e) => acc + e.hungerLevel, 0) / weekDaily.length
        avgHungerStr = avg.toFixed(1)
      }

      const daysSince = daysSinceLastInjection(entries)
      const daysSinceStr = daysSince == null ? "—" : String(daysSince)
      const lastDoseMg = lastInjection ? String(lastInjection.doseMg) : "—"

      const days = last7Days()
      const doseChartData = days.map((d) => {
        const key = formatDate(d)
        const dose = entries
          .filter((e) => entryDateKey(e) === key)
          .reduce((s, e) => s + e.doseMg, 0)
        return { label: format(d, "EEE"), dateKey: key, dose }
      })

      const hungerChartData = days.map((d) => {
        const key = formatDate(d)
        const row = dailyByDate.get(key)
        return {
          label: format(d, "EEE"),
          dateKey: key,
          hunger: row?.hungerLevel ?? null,
        }
      })

      return {
        weekDoses,
        avgHungerStr,
        daysSinceStr,
        lastDoseMg,
        doseChartData,
        hungerChartData,
      }
    }, [entries, dailyEntries, dailyByDate, lastInjection])

  const hasDoseChart = doseChartData.some((d) => d.dose > 0)
  const hasHungerChart = hungerChartData.some((d) => d.hunger != null)

  const historyGroups = useMemo(() => {
    const map = new Map<string, PeptideEntry[]>()
    for (const e of entries) {
      const d = entryDateKey(e)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(e)
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return keys.map((dateKey) => ({
      dateKey,
      items: map.get(dateKey)!.sort(
        (a, b) => new Date(b.injectedAt).getTime() - new Date(a.injectedAt).getTime()
      ),
    }))
  }, [entries])

  const historyDisplay = useMemo(
    () => partitionHistoryDayGroups(historyGroups, (g) => g.dateKey, today),
    [historyGroups, today]
  )

  const effectiveDoseLabel = customDose.trim() ? customDose : String(doseMg)
  const activeDateSaved = dailyByDate.has(activeDate)

  const sitesInRegion = useMemo(
    () => INJECTION_SITES.filter((s) => s.region === siteRegion),
    [siteRegion]
  )

  function toggleDailySideEffect(id: string) {
    setDailySideEffects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function toggleInjectionSideEffect(id: string) {
    setInjectionSideEffects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function selectDosePreset(mg: number) {
    setDoseMg(mg)
    setCustomDose("")
  }

  function selectSiteRegion(region: string) {
    setSiteRegion(region)
    const first = INJECTION_SITES.find((s) => s.region === region)
    if (first) setInjectionSite(first.id)
  }

  async function handleSaveDaily(e: React.FormEvent) {
    e.preventDefault()

    const res = await apiFetch("/api/peptides/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: activeDate,
        hungerLevel,
        sideEffects: dailySideEffects,
        notes: dailyNotes || null,
      }),
    })

    if (res.ok) {
      const entry = (await res.json()) as PeptideDailyEntry
      setDailyEntries((prev) => {
        const key = entryDateKey(entry)
        const rest = prev.filter((d) => entryDateKey(d) !== key)
        return [entry, ...rest].sort((a, b) => entryDateKey(b).localeCompare(entryDateKey(a)))
      })
    }
  }

  async function handleInjectionSubmit(e: React.FormEvent) {
    e.preventDefault()

    const effectiveDose = customDose.trim() ? Number(customDose) : doseMg
    if (!Number.isFinite(effectiveDose) || effectiveDose <= 0) return

    const [hh, mm] = injectionTime.split(":").map(Number)
    const injectedAt = new Date(`${today}T00:00:00`)
    injectedAt.setHours(hh ?? 0, mm ?? 0, 0, 0)

    const res = await apiFetch("/api/peptides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        injectedAt: injectedAt.toISOString(),
        compound,
        doseMg: effectiveDose,
        injectionSite,
        sideEffects: injectionSideEffects,
        notes: injectionNotes || null,
      }),
    })

    if (res.ok) {
      const entry = await res.json()
      setEntries((prev) =>
        [entry, ...prev].sort(
          (a, b) => new Date(b.injectedAt).getTime() - new Date(a.injectedAt).getTime()
        )
      )
      setInjectionNotes("")
      setInjectionSideEffects([])
      setInjectionOpen(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/peptides?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-5 pb-2">
      <PageHeader title="Peptides" />

      <PageHeroStrip
        color={PURPLE}
        icon={Gauge}
        eyebrow={`Appetite · ${formatDisplayDate(parseLocalDate(activeDate))}`}
        value={activeDayHunger != null ? String(activeDayHunger) : "—"}
        unit="/10"
        hint="· 10 = very hungry"
        footnotes={[
          ...(activeDayEffects.length > 0
            ? [activeDayEffects.map(sideEffectLabel).join(" · ")]
            : []),
          ...(lastSiteUsed
            ? [`Last shot: ${lastDoseMg} mg · ${injectionSiteLabel(lastSiteUsed)}`]
            : []),
        ]}
        metrics={[
          { label: "Days since shot", value: daysSinceStr },
          { label: "Avg hunger", value: avgHungerStr, sub: "7-day" },
          { label: "Last dose", value: lastDoseMg, sub: "mg" },
        ]}
      />

      <Button
        type="button"
        variant="glass"
        size="lg"
        className="w-full press-scale animate-fade-up stagger-1 gap-2"
        onClick={() => setInjectionOpen(true)}
      >
        <Syringe className="h-4 w-4 shrink-0" aria-hidden />
        Log Injection
      </Button>

      <Dialog open={injectionOpen} onOpenChange={setInjectionOpen}>
        <DialogContent className="glass-frost max-h-[min(90dvh,720px)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain sm:p-5">
          <DialogHeader>
            <DialogTitle className="type-hud-title font-sans normal-case tracking-normal">
              Log injection
            </DialogTitle>
            <DialogDescription className="type-hud-caption normal-case">
              Retatrutide · typically every 5–7 days · {formatDisplayDate(parseLocalDate(today))}
            </DialogDescription>
          </DialogHeader>

          {lastSiteUsed && (
            <p className="type-hud-caption -mt-1 normal-case">
              Last site:{" "}
              <span className="text-foreground/90">{injectionSiteLabel(lastSiteUsed)}</span>
              {" — rotate for next shot"}
            </p>
          )}

          <form onSubmit={handleInjectionSubmit} className="space-y-5">
            <div className="space-y-3">
              <SectionRail label="Dose & time" />
              <div className="glass-subtle space-y-3 rounded-xl p-3.5">
                <div className="space-y-1.5">
                  <Label className="type-hud-label">Compound</Label>
                  <div className="flex flex-wrap gap-2">
                    {COMPOUNDS.map((c) => (
                      <GlassChip
                        key={c.id}
                        selected={compound === c.id}
                        onClick={() => setCompound(c.id)}
                      >
                        {c.label}
                      </GlassChip>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="type-hud-label">Dose · {effectiveDoseLabel} mg</Label>
                  <div className="flex flex-wrap gap-2">
                    {DOSE_PRESETS_MG.map((mg) => (
                      <GlassChip
                        key={mg}
                        selected={doseMg === mg && !customDose}
                        onClick={() => selectDosePreset(mg)}
                      >
                        {mg} mg
                      </GlassChip>
                    ))}
                  </div>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    placeholder="Custom dose (mg)..."
                    value={customDose}
                    onChange={(e) => setCustomDose(e.target.value)}
                    className="bg-background/40 border-glass-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="injectionTime"
                    className="type-hud-label flex items-center gap-1.5"
                  >
                    <span className="status-dot" style={{ width: 4, height: 4 }} />
                    Injection time
                  </Label>
                  <Input
                    id="injectionTime"
                    type="time"
                    value={injectionTime}
                    onChange={(e) => setInjectionTime(e.target.value)}
                    className="tabular-nums text-lg tracking-widest bg-background/40 border-primary/15 focus-visible:border-primary/40 focus-visible:ring-primary/15"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <SectionRail label="Injection site" />
              <div className="glass-subtle space-y-3 rounded-xl p-3.5">
                <div className="flex flex-wrap gap-2">
                  {INJECTION_SITE_REGIONS.map((region) => (
                    <GlassChip
                      key={region.id}
                      selected={siteRegion === region.id}
                      onClick={() => selectSiteRegion(region.id)}
                    >
                      {region.label}
                    </GlassChip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {sitesInRegion.map((site) => (
                    <GlassChip
                      key={site.id}
                      selected={injectionSite === site.id}
                      onClick={() => setInjectionSite(site.id)}
                    >
                      {site.shortLabel}
                    </GlassChip>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <SectionRail label="Shot day" />
              <div className="glass-subtle space-y-3 rounded-xl p-3.5">
                <div className="space-y-1.5">
                  <Label className="type-hud-label">Side effects</Label>
                  <div className="flex flex-wrap gap-2">
                    {SIDE_EFFECTS.map((fx) => (
                      <GlassChip
                        key={fx.id}
                        selected={injectionSideEffects.includes(fx.id)}
                        onClick={() => toggleInjectionSideEffect(fx.id)}
                      >
                        {fx.label}
                      </GlassChip>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="injectionNotes" className="type-hud-label">
                    Injection notes
                  </Label>
                  <Input
                    id="injectionNotes"
                    placeholder="Optional — titration, vial, etc."
                    value={injectionNotes}
                    onChange={(e) => setInjectionNotes(e.target.value)}
                    className="bg-background/40 border-glass-border"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" variant="glass" className="w-full press-scale" size="lg">
              Log Injection
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Daily appetite */}
      <div className="glass hud-corners animate-fade-up stagger-1 rounded-2xl p-4 lg:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="type-hud-title">Daily appetite</p>
            <p className="type-hud-caption mt-1 normal-case">
              Log hunger &amp; side effects once per day between injections (every 5–7 days)
            </p>
          </div>
          {activeDateSaved && (
            <span className="type-hud-chip rounded-lg border border-primary/25 bg-primary/10 px-2 py-1 text-primary">
              Saved
            </span>
          )}
        </div>
        <form onSubmit={handleSaveDaily} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="type-hud-label">
              Hunger · {hungerLevel}/10
            </Label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <GlassChip
                  key={n}
                  selected={hungerLevel === n}
                  onClick={() => setHungerLevel(n)}
                  className="min-w-10 px-0"
                >
                  {n}
                </GlassChip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="type-hud-label">Side effects today</Label>
            <div className="flex flex-wrap gap-2">
              {SIDE_EFFECTS.map((fx) => (
                <GlassChip
                  key={fx.id}
                  selected={dailySideEffects.includes(fx.id)}
                  onClick={() => toggleDailySideEffect(fx.id)}
                >
                  {fx.label}
                </GlassChip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dailyNotes" className="type-hud-label">
              Notes (optional)
            </Label>
            <Input
              id="dailyNotes"
              placeholder="How's appetite today?"
              value={dailyNotes}
              onChange={(e) => setDailyNotes(e.target.value)}
              className="bg-background/40 border-glass-border"
            />
          </div>
          <Button type="submit" variant="glass" className="w-full press-scale sm:w-auto sm:min-w-[12rem]" size="lg">
            Save daily rating
          </Button>
        </form>
      </div>

      <CategoryGoal
        category="peptides"
        values={{ weekly: weekDoses }}
        presets={peptideGoalPresets}
        color={PURPLE}
      />

      {/* Trends */}
      <div className={cn("glass hud-corners min-w-0 animate-fade-up stagger-1 rounded-2xl p-4 lg:p-5")}>
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 shrink-0" style={{ color: PURPLE }} />
          <span className="type-hud-title">Trends</span>
          <div className="hud-divider flex-1" />
          <span className="type-hud-caption">Last 7 days</span>
        </div>
        {hasDoseChart || hasHungerChart ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="glass-subtle min-w-0 rounded-xl p-3">
              <h3 className="type-hud-subsection mb-2">Dose (mg)</h3>
              <div className="h-36 min-w-0 lg:h-40">
                {hasDoseChart ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={doseChartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/25" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={32}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value) => [`${Number(value ?? 0)} mg`, "Dose"]}
                        labelFormatter={(_, payload) => {
                          const p = payload?.[0]?.payload as { dateKey?: string } | undefined
                          return p?.dateKey ? format(parseLocalDate(p.dateKey), "EEE, MMM d") : ""
                        }}
                      />
                      <Bar dataKey="dose" fill={PURPLE} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="type-hud-caption">No doses logged</p>
                  </div>
                )}
              </div>
            </div>

            <div className="glass-subtle min-w-0 rounded-xl p-3">
              <h3 className="type-hud-subsection mb-2">Hunger / appetite</h3>
              <div className="h-36 min-w-0 lg:h-40">
                {hasHungerChart ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hungerChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={26}
                        domain={[1, 10]}
                        tick={{ fontSize: 10, fill: "oklch(0.55 0.01 250)" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value) => [
                          value != null ? `${Number(value).toFixed(1)}/10` : "—",
                          "Hunger",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="hunger"
                        stroke={PURPLE}
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: PURPLE }}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="type-hud-caption">Log hunger to see trends</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/15 lg:h-40">
            <p className="type-hud-caption px-4 text-center normal-case">
              Save daily appetite and log injections to see trends
            </p>
          </div>
        )}
      </div>

      {/* Injection history */}
      <div className="glass hud-corners animate-fade-up stagger-2 rounded-2xl p-4 lg:p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="type-hud-title">Injection history</span>
            <div className="hud-divider flex-1" />
            {entries.length > 0 && (
              <span className="type-hud-caption">{entries.length} total</span>
            )}
          </div>

          {entries.length === 0 && (
            <div className="glass-subtle rounded-xl p-8 text-center">
              <Syringe className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="type-hud-caption normal-case">No injections logged yet</p>
            </div>
          )}
          {historyDisplay.todayGroups.length > 0 && (
            <div className="space-y-2">
              <p className="type-hud-micro px-0.5">Today</p>
              {historyDisplay.todayGroups.map(({ dateKey, items }) => (
                <PeptideHistoryDayGroup
                  key={dateKey}
                  dateKey={dateKey}
                  items={items}
                  showDayHeader={false}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
          {historyDisplay.earlierGroups.length > 0 && (
            <HistoryEarlierSection dayCount={historyDisplay.earlierGroups.length}>
              {historyDisplay.earlierGroups.map(({ dateKey, items }) => (
                <PeptideHistoryDayGroup
                  key={dateKey}
                  dateKey={dateKey}
                  items={items}
                  showDayHeader
                  onDelete={handleDelete}
                />
              ))}
            </HistoryEarlierSection>
          )}
          <HistoryArchivedNote archivedDayCount={historyDisplay.archivedDayCount} />
      </div>
    </div>
  )
}
