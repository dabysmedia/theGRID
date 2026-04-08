"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import Link from "next/link"
import { Timer, Settings2, Utensils, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
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
  appendFastLog,
  getScheduleSnapshot,
  loadFastingConfig,
  saveFastingConfig,
  minutesToTimeInputValue,
  timeInputValueToMinutes,
  formatShortTime,
} from "@/lib/fasting"

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
}: {
  progress: number
  phase: FastingPhase
  elapsed: string
  remaining: string
}) {
  const size = 200
  const stroke = 4
  const center = size / 2
  const radius = center - stroke * 0.5 - 6
  const circumference = 2 * Math.PI * radius
  const offset = circumference - Math.min(progress, 1) * circumference

  const color = phase === "fasting" ? COLORS.fasting : COLORS.eating
  const phaseLabel = phase === "fasting" ? "Fast" : "Eat"
  const PhaseIcon = phase === "eating" ? Utensils : Timer

  return (
    <div className="mx-auto flex shrink-0 justify-center py-2 sm:py-3 sm:pl-1 sm:pr-4">
      <div className="relative" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/20"
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
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          style={{ filter: `drop-shadow(0 0 8px ${color}45)` }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 py-px">
        <div className="flex items-center gap-1.5" style={{ color }}>
          <PhaseIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">{phaseLabel}</span>
        </div>
        <span className="mt-1.5 text-3xl font-bold tabular-nums leading-none tracking-tight sm:text-4xl">{remaining}</span>
        <span className="mt-2 max-w-[12rem] truncate text-center text-[10px] tabular-nums leading-tight text-muted-foreground/55">
          {elapsed} in phase
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
      <DialogContent className="glass-frost min-h-0 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule & ratio</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground mb-2">
              Ratio presets
            </p>
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
                  <span className="block text-sm font-bold tabular-nums">{p.name}</span>
                  <span className="block text-[10px] text-muted-foreground/60 tracking-wider">
                    {p.fastHours}h / {p.eatHours}h
                  </span>
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
                <span className="block text-sm font-bold">Custom</span>
                <span className="block text-[10px] text-muted-foreground/60 tracking-wider">
                  hours
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Fast (h)
              </Label>
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
              <Label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Eat (h)
              </Label>
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
            <Label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Eating window opens (local time)
            </Label>
            <Input
              type="time"
              value={timeValue}
              onChange={(e) => {
                setEatStartMinutes(timeInputValueToMinutes(e.target.value))
                setSelected("Custom")
              }}
              className="tabular-nums font-mono"
            />
          </div>

          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground mb-2">
              Quick starts
            </p>
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

          <Button onClick={handleSave} className="w-full">
            Save schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function FastingTimer() {
  const [config, setConfig] = useState<FastingConfig>(loadFastingConfig)
  const [now, setNow] = useState(() => Date.now())
  const [mounted, setMounted] = useState(false)
  const prevPhase = useRef<FastingPhase | null>(null)
  const skipTransitionLog = useRef(false)

  // Client-only: avoid SSR/localStorage mismatch for timer shell + config
  /* eslint-disable react-hooks/set-state-in-effect -- intentional mount gate */
  useEffect(() => {
    setConfig(loadFastingConfig())
    setMounted(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const snapshot = useMemo(
    () => getScheduleSnapshot(new Date(now), config),
    [now, config]
  )

  useEffect(() => {
    if (!mounted) return
    const p = snapshot.phase
    if (skipTransitionLog.current) {
      skipTransitionLog.current = false
      prevPhase.current = p
      return
    }
    const was = prevPhase.current
    if (was !== null && was === "fasting" && p === "eating") {
      const eatStart = snapshot.eatingWindowStart
      const fastStart = new Date(eatStart.getTime() - config.fastHours * 3600000)
      const dm = (eatStart.getTime() - fastStart.getTime()) / 60000
      appendFastLog({
        fastStartedAt: fastStart.toISOString(),
        fastEndedAt: eatStart.toISOString(),
        durationMinutes: dm,
        plannedFastHours: config.fastHours,
      })
    }
    prevPhase.current = p
  }, [mounted, snapshot, config.fastHours])

  const handleConfigSave = useCallback((c: FastingConfig) => {
    skipTransitionLog.current = true
    saveFastingConfig(c)
    setConfig(loadFastingConfig())
  }, [])

  const phaseColor = snapshot.phase === "fasting" ? COLORS.fasting : COLORS.eating

  if (!mounted) {
    return (
      <div className="glass relative rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Timer className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/50">
            Fasting
          </span>
        </div>
        <div className="flex justify-center py-8">
          <div className="h-[200px] w-[200px] rounded-full bg-muted/10 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="glass relative rounded-2xl p-5 sm:p-6">
      <div
        className="absolute top-0 left-3 right-3 h-px transition-colors duration-700"
        style={{
          background: `linear-gradient(90deg, transparent, ${phaseColor}33, transparent)`,
        }}
      />

      <div className="relative z-10 mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: phaseColor,
              boxShadow: `0 0 6px ${phaseColor}60`,
              animation: "pulse-glow 2.5s ease-in-out infinite",
            }}
          />
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.2em]">Fasting</h2>
          <span className="hidden text-[10px] text-muted-foreground/55 sm:inline">· {config.presetName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            href="/fasting"
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-glass-highlight/30 hover:text-foreground sm:h-8 sm:w-8"
            aria-label="Fasting history and trends"
          >
            <TrendingUp className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Link>
          <FastingSettingsDialog config={config} onSave={handleConfigSave} />
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-stretch gap-5 sm:flex-row sm:items-center sm:gap-8 lg:gap-10">
        <FastingRing
          progress={snapshot.progress}
          phase={snapshot.phase}
          elapsed={formatDuration(snapshot.elapsedMs)}
          remaining={formatDuration(snapshot.remainingMs)}
        />

        <div className="min-w-0 flex-1 sm:py-1">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="flex min-w-0 items-start gap-2 rounded-sm border border-border/35 bg-muted/15 px-2 py-2 sm:px-2.5">
              <Utensils className="mt-0.5 h-3 w-3 shrink-0" style={{ color: COLORS.eating }} />
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/65">Eat window</p>
                <p className="text-[10px] font-semibold tabular-nums leading-snug text-foreground sm:text-[11px]">
                  {formatShortTime(snapshot.eatingWindowStart)} – {formatShortTime(snapshot.eatingWindowEnd)}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2 rounded-sm border border-border/35 bg-muted/15 px-2 py-2 sm:px-2.5">
              <Timer className="mt-0.5 h-3 w-3 shrink-0" style={{ color: COLORS.fasting }} />
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/65">
                  {snapshot.phase === "fasting" ? "Next eat" : "Next fast"}
                </p>
                <p className="text-[10px] font-semibold tabular-nums text-foreground sm:text-[11px]">
                  {formatShortTime(snapshot.phaseEnd)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
