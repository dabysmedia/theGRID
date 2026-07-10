"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import Link from "next/link"
import { format, subDays } from "date-fns"
import {
  Timer,
  Settings2,
  Utensils,
  Pause,
  Play,
  Square,
  PowerOff,
  ChevronRight,
} from "lucide-react"
import { cn, glassPanelClass, parseLocalDate } from "@/lib/utils"
import { MiniChart } from "./MiniChart"
import { useActiveDate } from "@/context/DateContext"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type FastingConfig,
  type FastingPhase,
  ensureFastLogForEatingPhase,
  getAnchoredScheduleSnapshot,
  getScheduleSnapshot,
  loadFastingConfig,
  saveFastingConfig,
  minutesToTimeInputValue,
  timeInputValueToMinutes,
  formatShortTime,
  loadFastingTimerPausedAtMs,
  saveFastingTimerPausedAtMs,
  loadFastingTimerDisabled,
  saveFastingTimerDisabled,
  loadFastingLastMealAtMs,
  saveFastingLastMealAtMs,
  minutesFromMidnight,
  parseTimeInputToLastMealDate,
  syncFastingProfileToServer,
  aggregateFastHoursByDay,
  loadFastLogs,
  FASTING_TIMER_CHANGED_EVENT,
  type FastLogEntry,
} from "@/lib/fasting"
import { useUser } from "@/context/UserContext"

const PRESETS = [
  { name: "16:8", fastHours: 16, eatHours: 8, eatStartMinutes: 12 * 60 },
  { name: "18:6", fastHours: 18, eatHours: 6, eatStartMinutes: 14 * 60 },
  { name: "20:4", fastHours: 20, eatHours: 4, eatStartMinutes: 14 * 60 },
  { name: "14:10", fastHours: 14, eatHours: 10, eatStartMinutes: 10 * 60 },
  { name: "OMAD", fastHours: 23, eatHours: 1, eatStartMinutes: 10 * 60 },
] as const

const COLORS = {
  fasting: "#f97316",
  eating: "#22c55e",
} as const

/** Matches hub weekly hero / glass-panel — vertical tint + depth shadow */
const FASTING_CARD_SHEEN = cn(
  glassPanelClass,
  "bg-gradient-to-b from-glass-highlight/[0.14] via-transparent to-primary/[0.03] dark:from-glass-highlight/[0.1] dark:to-primary/[0.05]"
)

function padTwo(n: number) {
  return String(Math.floor(n)).padStart(2, "0")
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "00:00:00"
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${padTwo(h)}:${padTwo(m)}:${padTwo(s)}`
}

function FastingRing({
  progress,
  phase,
  elapsed,
  remaining,
  inactive,
  compact,
}: {
  progress: number
  phase: FastingPhase
  elapsed: string
  remaining: string
  inactive?: boolean
  /** Hub overview: scale ring with `--hub-fasting-ring` on mobile. */
  compact?: boolean
}) {
  const size = 200
  const stroke = 4
  const center = size / 2
  const radius = center - stroke * 0.5 - 6
  const circumference = 2 * Math.PI * radius
  const offset = inactive
    ? circumference
    : circumference - Math.min(progress, 1) * circumference

  const color = inactive
    ? "oklch(0.55 0.02 250)"
    : phase === "fasting"
      ? COLORS.fasting
      : COLORS.eating
  const phaseLabel = inactive ? "Timer off" : phase === "fasting" ? "Fast" : "Eat"
  const PhaseIcon = inactive ? PowerOff : phase === "eating" ? Utensils : Timer
  const displayRemaining = inactive ? "00:00:00" : remaining
  const displayElapsed = inactive ? "—" : elapsed

  return (
    <div
      className={cn(
        "mx-auto flex shrink-0 justify-center py-2 sm:py-3 sm:pl-1 sm:pr-4",
        compact && "max-lg:py-0.5",
      )}
    >
      <div
        className={cn(
          "relative",
          compact && "size-[var(--hub-fasting-ring)] lg:size-[200px]",
        )}
        style={compact ? undefined : { width: size, height: size }}
      >
        <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className={inactive ? "text-muted-foreground/25" : "text-muted/20"}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn(
              "transition-[stroke-dashoffset] duration-1000 ease-linear",
              inactive && "opacity-50",
            )}
            style={
              inactive
                ? undefined
                : { filter: `drop-shadow(0 0 8px ${color}45)` }
            }
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 py-px">
          <div
            className={cn(
              "flex items-center gap-1.5",
              inactive && "text-muted-foreground",
            )}
            style={inactive ? undefined : { color }}
          >
            <PhaseIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="type-hud-chip">{phaseLabel}</span>
          </div>
          <span
            className={cn(
              "type-hud-value-xl mt-1.5",
              inactive && "text-muted-foreground/90",
            )}
          >
            {displayRemaining}
          </span>
          <span
            className={cn(
              "mt-2 max-w-[12rem] truncate text-center text-[10px] tabular-nums leading-tight",
              inactive ? "text-muted-foreground/45" : "text-muted-foreground/55",
            )}
          >
            {inactive ? "Timer inactive" : `${displayElapsed} in phase`}
          </span>
        </div>
      </div>
    </div>
  )
}

function FastingSettingsDialog({
  config,
  onSave,
}: {
  config: FastingConfig
  onSave: (c: FastingConfig) => void
}) {
  const [open, setOpen] = useState(false)
  const [customFast, setCustomFast] = useState(String(config.fastHours))
  const [customEat, setCustomEat] = useState(String(config.eatHours))
  const [eatStartMinutes, setEatStartMinutes] = useState(config.eatWindowStartMinutes)
  const [selected, setSelected] = useState(config.presetName)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setCustomFast(String(config.fastHours))
      setCustomEat(String(config.eatHours))
      setEatStartMinutes(config.eatWindowStartMinutes)
      setSelected(config.presetName)
    }
  }

  function handlePreset(p: (typeof PRESETS)[number]) {
    setSelected(p.name)
    setCustomFast(String(p.fastHours))
    setCustomEat(String(p.eatHours))
    setEatStartMinutes(p.eatStartMinutes)
  }

  function handleSave() {
    const fh = Math.max(1, Math.min(23, Number(customFast) || 16))
    let eh = Math.max(1, Math.min(23, Number(customEat) || 8))
    if (fh + eh !== 24) eh = 24 - fh
    const presetHit = PRESETS.find((p) => p.fastHours === fh && p.eatHours === eh)
    onSave({
      fastHours: fh,
      eatHours: eh,
      eatWindowStartMinutes: eatStartMinutes,
      presetName: presetHit?.name ?? "Custom",
    })
    setOpen(false)
  }

  const timeValue = minutesToTimeInputValue(eatStartMinutes)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-xs" className="text-muted-foreground/50 hover:text-foreground" />
        }
      >
        <Settings2 className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="glass-frost min-h-0 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule & ratio</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="type-hud-label mb-2">Ratio presets</p>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className={cn(
                    "rounded-xl glass-subtle px-3 py-2 text-center transition-all duration-150 hover:bg-glass-highlight/30",
                    selected === p.name && "ring-1 ring-primary bg-primary/10"
                  )}
                >
                  <span className="type-hud-stat block">{p.name}</span>
                  <span className="type-hud-caption block">{p.fastHours}h / {p.eatHours}h</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelected("Custom")}
                className={cn(
                  "rounded-xl glass-subtle px-3 py-2 text-center transition-all duration-150 hover:bg-glass-highlight/30",
                  selected === "Custom" && "ring-1 ring-primary bg-primary/10"
                )}
              >
                <span className="type-hud-stat block">Custom</span>
                <span className="type-hud-caption block">hours</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="type-hud-label">Fast (h)</Label>
              <Input
                type="number"
                min={1}
                max={23}
                value={customFast}
                onChange={(e) => {
                  setCustomFast(e.target.value)
                  setSelected("Custom")
                }}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="type-hud-label">Eat (h)</Label>
              <Input
                type="number"
                min={1}
                max={23}
                value={customEat}
                onChange={(e) => {
                  setCustomEat(e.target.value)
                  setSelected("Custom")
                }}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="type-hud-label">Eating window opens (local time)</Label>
            <Input
              type="time"
              value={timeValue}
              onChange={(e) => {
                setEatStartMinutes(timeInputValueToMinutes(e.target.value))
                setSelected("Custom")
              }}
              className="tabular-nums"
            />
          </div>

          <div>
            <p className="type-hud-label mb-2">Quick starts</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "10am", m: 10 * 60 },
                { label: "12pm", m: 12 * 60 },
                { label: "2pm", m: 14 * 60 },
                { label: "6pm", m: 18 * 60 },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    setEatStartMinutes(q.m)
                    setSelected("Custom")
                  }}
                  className="rounded-lg glass-subtle px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider hover:bg-glass-highlight/30"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <Button variant="glass" onClick={handleSave} className="w-full">
            Save schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FastingStatsStrip({
  activeDate,
  logs,
  goal,
}: {
  activeDate: string
  logs: FastLogEntry[]
  goal: number
}) {
  const { todayValue, last7 } = useMemo(() => {
    const end = parseLocalDate(activeDate)
    const keys = Array.from({ length: 7 }, (_, i) => format(subDays(end, 6 - i), "yyyy-MM-dd"))
    const byDay = aggregateFastHoursByDay(logs, keys)
    const last7 = keys.map((k) => Math.round((byDay[k] ?? 0) * 10) / 10)
    const todayKey = format(end, "yyyy-MM-dd")
    const todayValue = Math.round((byDay[todayKey] ?? 0) * 10) / 10
    return { todayValue, last7 }
  }, [activeDate, logs])

  return (
    <Link
      href="/fasting"
      className="group flex items-center gap-3 rounded-xl border border-border/35 bg-muted/15 px-3 py-2.5 transition-colors hover:bg-glass-highlight/25 active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <MiniChart data={last7.map((v) => ({ value: v }))} color={COLORS.fasting} />
      </div>
      <div className="shrink-0 text-right">
        <p className="type-hud-stat tabular-nums text-foreground">{todayValue}</p>
        <p className="type-hud-caption text-muted-foreground/70">
          hrs today · {goal}h goal
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground/70" />
    </Link>
  )
}

export function FastingTimer({ hubCompact = false }: { hubCompact?: boolean }) {
  const { user } = useUser()
  const { activeDate } = useActiveDate()
  const userId = user?.id ?? null
  const [config, setConfig] = useState<FastingConfig>(loadFastingConfig)
  const [now, setNow] = useState(() => Date.now())
  const [pausedAtMs, setPausedAtMs] = useState<number | null>(null)
  const [timerDisabled, setTimerDisabled] = useState(false)
  const [lastMealAtMs, setLastMealAtMs] = useState<number | null>(null)
  const [fastLogs, setFastLogs] = useState<FastLogEntry[]>([])
  const [mounted, setMounted] = useState(false)
  const skipTransitionLog = useRef(false)

  // Client-only: avoid SSR/localStorage mismatch for timer shell + config
  /* eslint-disable react-hooks/set-state-in-effect -- intentional mount gate */
  useEffect(() => {
    function refreshTimerShell() {
      setConfig(loadFastingConfig())
      setPausedAtMs(loadFastingTimerPausedAtMs())
      setTimerDisabled(loadFastingTimerDisabled())
      setLastMealAtMs(loadFastingLastMealAtMs())
      setFastLogs(loadFastLogs())
      setMounted(true)
    }
    refreshTimerShell()
    window.addEventListener(FASTING_TIMER_CHANGED_EVENT, refreshTimerShell)
    return () =>
      window.removeEventListener(FASTING_TIMER_CHANGED_EVENT, refreshTimerShell)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    function refreshLogs() {
      setFastLogs(loadFastLogs())
    }
    refreshLogs()
    window.addEventListener("fasting-logs-changed", refreshLogs)
    return () => window.removeEventListener("fasting-logs-changed", refreshLogs)
  }, [])

  useEffect(() => {
    if (!mounted) return
    void syncFastingProfileToServer(userId)
  }, [mounted, userId])

  const isPaused = pausedAtMs != null
  const effectiveNow = timerDisabled ? now : isPaused ? pausedAtMs : now

  useEffect(() => {
    if (timerDisabled || isPaused) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [timerDisabled, isPaused])

  const snapshot = useMemo(() => {
    const d = new Date(effectiveNow)
    if (!timerDisabled && lastMealAtMs != null) {
      return getAnchoredScheduleSnapshot(d, new Date(lastMealAtMs), config)
    }
    return getScheduleSnapshot(d, config)
  }, [effectiveNow, config, timerDisabled, lastMealAtMs])

  const handlePause = useCallback(() => {
    const t = Date.now()
    saveFastingTimerPausedAtMs(t)
    setPausedAtMs(t)
    setNow(t)
  }, [])

  const handleResume = useCallback(() => {
    saveFastingTimerPausedAtMs(null)
    setPausedAtMs(null)
    setNow(Date.now())
  }, [])

  /** Turn off the fasting widget until the user enables it again (not the same as pause). */
  const handleEnd = useCallback(() => {
    saveFastingTimerPausedAtMs(null)
    setPausedAtMs(null)
    saveFastingLastMealAtMs(null)
    setLastMealAtMs(null)
    saveFastingTimerDisabled(true)
    setTimerDisabled(true)
    setNow(Date.now())
    void syncFastingProfileToServer(userId)
  }, [userId])

  useEffect(() => {
    if (!mounted) return
    if (timerDisabled) return
    if (skipTransitionLog.current) {
      skipTransitionLog.current = false
      return
    }
    ensureFastLogForEatingPhase(snapshot, config)
  }, [mounted, timerDisabled, snapshot, config])

  const handleConfigSave = useCallback((c: FastingConfig) => {
    skipTransitionLog.current = true
    saveFastingConfig(c)
    setConfig(loadFastingConfig())
    void syncFastingProfileToServer(userId)
  }, [userId])

  const phaseColor = snapshot.phase === "fasting" ? COLORS.fasting : COLORS.eating

  const headerTitleContent = (
    <>
      <div
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          backgroundColor: phaseColor,
          boxShadow: `0 0 6px ${phaseColor}60`,
          animation: isPaused ? "none" : "pulse-glow 2.5s ease-in-out infinite",
        }}
      />
      <h2 className="type-hud-title truncate">Fasting</h2>
      <span className="hidden text-[10px] text-muted-foreground/55 sm:inline">
        · {config.presetName}
      </span>
      {isPaused && (
        <span className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Paused
        </span>
      )}
    </>
  )

  // Inactive timer lives beside the bottom nav (`FastingNavChip`), not in the hub body.
  if (!mounted || timerDisabled) {
    return null
  }

  return (
    <div
      className={cn(
        FASTING_CARD_SHEEN,
        "shrink-0",
        hubCompact ? "p-3 sm:p-6 max-lg:p-3" : "p-5 sm:p-6",
        hubCompact && "animate-fade-up stagger-3 max-lg:mt-[var(--hub-section-gap)]",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,oklch(1_0_0/14%),transparent_58%)] dark:bg-[radial-gradient(ellipse_90%_50%_at_50%_-6%,oklch(1_0_0/10%),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-glass-highlight/45 to-transparent dark:via-white/12"
        aria-hidden
      />

      <div className="relative z-10 mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {headerTitleContent}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <FastingSettingsDialog config={config} onSave={handleConfigSave} />
        </div>
      </div>

      <div
        className={cn(
          "relative z-10 flex flex-col items-stretch gap-5 sm:flex-row sm:items-center sm:gap-8 lg:gap-10",
          hubCompact && "max-lg:flex-row max-lg:items-center max-lg:gap-3",
        )}
      >
        <FastingRing
          progress={snapshot.progress}
          phase={snapshot.phase}
          elapsed={formatDuration(snapshot.elapsedMs)}
          remaining={formatDuration(snapshot.remainingMs)}
          compact={hubCompact}
        />

        <div className={cn("min-w-0 flex-1 sm:py-1", hubCompact && "max-lg:py-0")}>
          <div
            className={cn(
              "grid grid-cols-2 gap-2 sm:gap-3",
              hubCompact && "max-lg:gap-1.5",
            )}
          >
            <div className="flex min-w-0 items-start gap-2 rounded-sm border border-border/35 bg-muted/15 px-2 py-2 sm:px-2.5">
              <Utensils
                className="mt-0.5 h-3 w-3 shrink-0"
                style={{ color: COLORS.eating }}
              />
              <div className="min-w-0">
                <p className="type-hud-micro">Eat window</p>
                <p className="type-hud-readout text-foreground">
                  {`${formatShortTime(snapshot.eatingWindowStart)} – ${formatShortTime(snapshot.eatingWindowEnd)}`}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2 rounded-sm border border-border/35 bg-muted/15 px-2 py-2 sm:px-2.5">
              <Timer
                className="mt-0.5 h-3 w-3 shrink-0"
                style={{ color: COLORS.fasting }}
              />
              <div className="min-w-0">
                <p className="type-hud-micro">
                  {snapshot.phase === "fasting" ? "Next eat" : "Next fast"}
                </p>
                <p className="type-hud-readout text-foreground">
                  {formatShortTime(snapshot.phaseEnd)}
                </p>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "relative z-[2] mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start",
              hubCompact && "max-lg:mt-2",
            )}
          >
            <Button
              type="button"
              variant={isPaused ? "default" : "outline"}
              size="sm"
              className="h-9 gap-1.5 touch-manipulation sm:h-8"
              onClick={isPaused ? handleResume : handlePause}
              aria-label={isPaused ? "Resume live timer" : "Pause timer"}
            >
              {isPaused ? (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 gap-1.5 touch-manipulation sm:h-8"
              onClick={handleEnd}
              aria-label="End and turn off fasting timer"
            >
              <Square className="h-3.5 w-3.5" />
              End
            </Button>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-4 border-t border-border/25 pt-4">
        <FastingStatsStrip
          activeDate={activeDate}
          logs={fastLogs}
          goal={config.fastHours}
        />
      </div>
    </div>
  )
}

/** Compact inactive fasting control — sits left of the bottom nav menu FAB. */
export function FastingNavChip() {
  const { user } = useUser()
  const userId = user?.id ?? null
  const [mounted, setMounted] = useState(false)
  const [timerDisabled, setTimerDisabled] = useState(false)
  const [config, setConfig] = useState<FastingConfig>(loadFastingConfig)
  const [startFastingOpen, setStartFastingOpen] = useState(false)
  const [lastMealInput, setLastMealInput] = useState("")
  const [startFastingError, setStartFastingError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- intentional mount gate */
  useEffect(() => {
    function refresh() {
      setTimerDisabled(loadFastingTimerDisabled())
      setConfig(loadFastingConfig())
      setMounted(true)
    }
    refresh()
    window.addEventListener(FASTING_TIMER_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(FASTING_TIMER_CHANGED_EVENT, refresh)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleStartFastingOpenChange = useCallback((open: boolean) => {
    setStartFastingOpen(open)
    setStartFastingError(null)
    if (open) {
      const suggested = new Date(Date.now() - 60 * 60 * 1000)
      setLastMealInput(minutesToTimeInputValue(minutesFromMidnight(suggested)))
    }
  }, [])

  const handleConfirmStartFasting = useCallback(() => {
    const tEnd = Date.now()
    const parsed = parseTimeInputToLastMealDate(lastMealInput, new Date(tEnd))
    if (!parsed) {
      setStartFastingError("Enter a valid time.")
      return
    }
    const ms = parsed.getTime()
    saveFastingLastMealAtMs(ms)
    saveFastingTimerDisabled(false)
    saveFastingTimerPausedAtMs(null)
    setTimerDisabled(false)
    setStartFastingOpen(false)
    setStartFastingError(null)
    void syncFastingProfileToServer(userId)
  }, [lastMealInput, userId])

  if (!mounted || !timerDisabled) return null

  return (
    <Dialog open={startFastingOpen} onOpenChange={handleStartFastingOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              "relative flex h-16 shrink-0 touch-manipulation flex-col items-center justify-center gap-0.5 px-2.5",
              "rounded-lg border border-dashed border-muted-foreground/35",
              "bg-gradient-to-b from-muted/45 via-muted/25 to-muted/40",
              "shadow-[inset_0_1px_0_0_oklch(1_0_0/6%)]",
              "text-muted-foreground transition-colors duration-200",
              "hover:border-muted-foreground/50 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "dark:from-muted/30 dark:via-muted/15 dark:to-muted/25 dark:border-muted-foreground/30",
            )}
            aria-label="Start fasting"
          />
        }
      >
        <PowerOff className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em]">
          Fast
        </span>
      </DialogTrigger>
      <DialogContent className="glass-frost min-h-0 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What time was your last meal?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Your fast starts from that moment using your{" "}
          <span className="font-medium text-foreground">
            {config.fastHours}h fast / {config.eatHours}h eat
          </span>{" "}
          schedule{config.presetName ? ` (${config.presetName})` : ""}. We use today’s
          date, or yesterday if that time hasn’t happened yet today.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="fasting-nav-last-meal" className="type-hud-label">
            Time
          </Label>
          <Input
            id="fasting-nav-last-meal"
            type="time"
            value={lastMealInput}
            onChange={(e) => {
              setLastMealInput(e.target.value)
              setStartFastingError(null)
            }}
            className="tabular-nums"
          />
        </div>
        {startFastingError ? (
          <p className="text-sm text-destructive">{startFastingError}</p>
        ) : null}
        <Button variant="glass" className="w-full" onClick={handleConfirmStartFasting}>
          Start timer
        </Button>
      </DialogContent>
    </Dialog>
  )
}
