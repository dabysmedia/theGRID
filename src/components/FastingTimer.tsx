"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Timer, Settings2, Play, Square, Utensils, RotateCcw } from "lucide-react"
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

/* ─── Constants ─────────────────────────────────────── */

const LS_CONFIG_KEY = "theGRID_fasting_config"
const LS_STATE_KEY = "theGRID_fasting_state"

const PRESETS = [
  { name: "16:8", fastHours: 16, eatHours: 8 },
  { name: "18:6", fastHours: 18, eatHours: 6 },
  { name: "20:4", fastHours: 20, eatHours: 4 },
  { name: "14:10", fastHours: 14, eatHours: 10 },
  { name: "OMAD", fastHours: 23, eatHours: 1 },
] as const

const COLORS = {
  fasting: "#f97316",
  eating: "#22c55e",
  idle: "oklch(0.82 0.18 110)",
} as const

/* ─── Types ─────────────────────────────────────────── */

interface FastingConfig {
  fastHours: number
  eatHours: number
  presetName: string
}

interface FastingState {
  startTime: string | null
  isActive: boolean
}

type Phase = "idle" | "fasting" | "eating" | "completed"

/* ─── Helpers ───────────────────────────────────────── */

function loadConfig(): FastingConfig {
  if (typeof window === "undefined") return { fastHours: 16, eatHours: 8, presetName: "16:8" }
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* noop */ }
  return { fastHours: 16, eatHours: 8, presetName: "16:8" }
}

function saveConfig(c: FastingConfig) {
  localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(c))
}

function loadState(): FastingState {
  if (typeof window === "undefined") return { startTime: null, isActive: false }
  try {
    const raw = localStorage.getItem(LS_STATE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* noop */ }
  return { startTime: null, isActive: false }
}

function saveState(s: FastingState) {
  localStorage.setItem(LS_STATE_KEY, JSON.stringify(s))
}

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

function formatTimeShort(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

/* ─── Ring Component ────────────────────────────────── */

function FastingRing({
  progress,
  phase,
  elapsed,
  remaining,
}: {
  progress: number
  phase: Phase
  elapsed: string
  remaining: string
}) {
  const radius = 62
  const stroke = 4
  const size = 160
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - Math.min(progress, 1) * circumference

  const color = phase === "fasting" ? COLORS.fasting : phase === "eating" ? COLORS.eating : COLORS.idle
  const phaseLabel = phase === "fasting" ? "FASTING" : phase === "eating" ? "EATING" : phase === "completed" ? "COMPLETE" : "READY"
  const PhaseIcon = phase === "eating" ? Utensils : Timer

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/20"
        />
        {phase !== "idle" && (
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
            style={{ filter: `drop-shadow(0 0 8px ${color}50)` }}
          />
        )}
        {[0, 90, 180, 270].map((deg) => (
          <line
            key={deg}
            x1={center}
            y1="4"
            x2={center}
            y2="8"
            stroke={color}
            strokeWidth="0.5"
            opacity="0.3"
            transform={`rotate(${deg} ${center} ${center})`}
          />
        ))}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <PhaseIcon className="h-4 w-4" style={{ color }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.2em]"
          style={{ color }}
        >
          {phaseLabel}
        </span>
        {phase !== "idle" && phase !== "completed" && (
          <>
            <span className="text-2xl font-bold tabular-nums tracking-tight">
              {remaining}
            </span>
            <span className="text-[10px] text-muted-foreground/60 tracking-wider">
              {elapsed} elapsed
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Settings Dialog ───────────────────────────────── */

function FastingSettingsDialog({
  config,
  onSave,
  disabled,
}: {
  config: FastingConfig
  onSave: (c: FastingConfig) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [customFast, setCustomFast] = useState(String(config.fastHours))
  const [customEat, setCustomEat] = useState(String(config.eatHours))
  const [selected, setSelected] = useState(config.presetName)

  useEffect(() => {
    if (open) {
      setCustomFast(String(config.fastHours))
      setCustomEat(String(config.eatHours))
      setSelected(config.presetName)
    }
  }, [open, config])

  function handlePreset(p: typeof PRESETS[number]) {
    setSelected(p.name)
    setCustomFast(String(p.fastHours))
    setCustomEat(String(p.eatHours))
  }

  function handleSave() {
    const fh = Math.max(1, Math.min(23, Number(customFast) || 16))
    const eh = Math.max(1, Math.min(23, Number(customEat) || 8))
    const preset = PRESETS.find((p) => p.fastHours === fh && p.eatHours === eh)
    onSave({ fastHours: fh, eatHours: eh, presetName: preset?.name ?? "Custom" })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            className="text-muted-foreground/50 hover:text-foreground"
          />
        }
      >
        <Settings2 className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="glass-frost">
        <DialogHeader>
          <DialogTitle>Fasting Window</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground mb-2">
              Presets
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className={cn(
                    "glass-subtle py-2 px-3 text-center transition-all duration-150 hover:bg-glass-highlight/30",
                    selected === p.name && "ring-1 ring-primary bg-primary/10"
                  )}
                  style={{ borderRadius: "3px" }}
                >
                  <span className="block text-sm font-bold tabular-nums">{p.name}</span>
                  <span className="block text-[10px] text-muted-foreground/60 tracking-wider">
                    {p.fastHours}h fast
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelected("Custom")}
                className={cn(
                  "glass-subtle py-2 px-3 text-center transition-all duration-150 hover:bg-glass-highlight/30",
                  selected === "Custom" && "ring-1 ring-primary bg-primary/10"
                )}
                style={{ borderRadius: "3px" }}
              >
                <span className="block text-sm font-bold">Custom</span>
                <span className="block text-[10px] text-muted-foreground/60 tracking-wider">
                  set hours
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Fast (hours)
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
                Eat (hours)
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

          <Button onClick={handleSave} className="w-full">
            Save Window
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── Main Component ────────────────────────────────── */

export function FastingTimer() {
  const [config, setConfig] = useState<FastingConfig>(loadConfig)
  const [state, setState] = useState<FastingState>(loadState)
  const [now, setNow] = useState(() => Date.now())
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Tick every second while a fast is active
  useEffect(() => {
    if (!state.isActive) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [state.isActive])

  const { phase, progress, elapsedMs, remainingMs, fastEndTime, eatEndTime } = useMemo(() => {
    if (!state.isActive || !state.startTime) {
      return { phase: "idle" as Phase, progress: 0, elapsedMs: 0, remainingMs: 0, fastEndTime: null, eatEndTime: null }
    }

    const start = new Date(state.startTime).getTime()
    const fastMs = config.fastHours * 3600_000
    const eatMs = config.eatHours * 3600_000
    const totalMs = fastMs + eatMs
    const elapsed = now - start

    const fEnd = new Date(start + fastMs)
    const eEnd = new Date(start + totalMs)

    if (elapsed < 0) {
      return { phase: "fasting" as Phase, progress: 0, elapsedMs: 0, remainingMs: fastMs, fastEndTime: fEnd, eatEndTime: eEnd }
    }

    if (elapsed < fastMs) {
      return {
        phase: "fasting" as Phase,
        progress: elapsed / fastMs,
        elapsedMs: elapsed,
        remainingMs: fastMs - elapsed,
        fastEndTime: fEnd,
        eatEndTime: eEnd,
      }
    }

    if (elapsed < totalMs) {
      return {
        phase: "eating" as Phase,
        progress: (elapsed - fastMs) / eatMs,
        elapsedMs: elapsed,
        remainingMs: totalMs - elapsed,
        fastEndTime: fEnd,
        eatEndTime: eEnd,
      }
    }

    return { phase: "completed" as Phase, progress: 1, elapsedMs: elapsed, remainingMs: 0, fastEndTime: fEnd, eatEndTime: eEnd }
  }, [state, config, now])

  const startFast = useCallback(() => {
    const next: FastingState = { startTime: new Date().toISOString(), isActive: true }
    setState(next)
    saveState(next)
    setNow(Date.now())
  }, [])

  const stopFast = useCallback(() => {
    const next: FastingState = { startTime: null, isActive: false }
    setState(next)
    saveState(next)
  }, [])

  const handleConfigSave = useCallback((c: FastingConfig) => {
    setConfig(c)
    saveConfig(c)
  }, [])

  const phaseColor = phase === "fasting" ? COLORS.fasting : phase === "eating" ? COLORS.eating : COLORS.idle

  if (!mounted) {
    return (
      <div className="glass p-5 lg:p-6 relative overflow-hidden" style={{ borderRadius: "4px" }}>
        <div className="flex items-center gap-2">
          <Timer className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/50">
            Fasting Timer
          </span>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="h-[160px] w-[160px] rounded-full bg-muted/10 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div
      className="glass p-5 lg:p-6 relative overflow-hidden"
      style={{ borderRadius: "4px" }}
    >
      {/* Top edge glow */}
      <div
        className="absolute top-0 left-3 right-3 h-px transition-colors duration-700"
        style={{
          background: `linear-gradient(90deg, transparent, ${phaseColor}33, transparent)`,
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: phaseColor,
              boxShadow: `0 0 6px ${phaseColor}60`,
              animation: state.isActive ? "pulse-glow 2.5s ease-in-out infinite" : "none",
            }}
          />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.25em]">
            Fasting Timer
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60 font-medium tracking-[0.12em]">
            {config.presetName}
          </span>
          <FastingSettingsDialog
            config={config}
            onSave={handleConfigSave}
            disabled={state.isActive}
          />
        </div>
      </div>

      {/* Ring + Controls */}
      <div className="flex flex-col items-center gap-4 relative z-10">
        <FastingRing
          progress={progress}
          phase={phase}
          elapsed={formatDuration(elapsedMs)}
          remaining={formatDuration(remainingMs)}
        />

        {/* Schedule info */}
        {state.isActive && fastEndTime && eatEndTime && (
          <div className="flex gap-3 animate-fade-up">
            <div className="glass-subtle py-1.5 px-3 flex items-center gap-1.5" style={{ borderRadius: "3px" }}>
              <Timer className="h-3 w-3" style={{ color: COLORS.fasting }} />
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.1em]">
                  {phase === "fasting" ? "Eat at" : "Started"}
                </p>
                <p className="text-[11px] font-semibold tabular-nums">
                  {phase === "fasting"
                    ? formatTimeShort(fastEndTime)
                    : formatTimeShort(new Date(state.startTime!))}
                </p>
              </div>
            </div>
            <div className="glass-subtle py-1.5 px-3 flex items-center gap-1.5" style={{ borderRadius: "3px" }}>
              <Utensils className="h-3 w-3" style={{ color: COLORS.eating }} />
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.1em]">
                  {phase === "eating" ? "Fast at" : "Eat end"}
                </p>
                <p className="text-[11px] font-semibold tabular-nums">
                  {formatTimeShort(eatEndTime)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {phase === "idle" && (
            <Button onClick={startFast} size="sm" className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              Start Fast
            </Button>
          )}
          {(phase === "fasting" || phase === "eating") && (
            <Button onClick={stopFast} variant="outline" size="sm" className="gap-1.5">
              <Square className="h-3 w-3" />
              End Fast
            </Button>
          )}
          {phase === "completed" && (
            <>
              <Button onClick={startFast} size="sm" className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Start New Fast
              </Button>
              <Button onClick={stopFast} variant="outline" size="sm" className="gap-1.5">
                Reset
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
