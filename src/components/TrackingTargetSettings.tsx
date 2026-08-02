"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  Droplets,
  Flame,
  Footprints,
  MoonStar,
  RotateCcw,
  Save,
  type LucideIcon,
} from "lucide-react"
import { useUser } from "@/context/UserContext"
import { apiFetch } from "@/lib/api-fetch"
import {
  TRACKING_TARGET_DEFAULTS,
  type CoreTrackingTarget,
} from "@/lib/tracking-targets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface GoalRow {
  id: string
  category: string
  goalType: string
  direction: string
  target: number
  unit: string
  active: boolean
}

interface TargetDefinition {
  category: CoreTrackingTarget
  label: string
  description: string
  unit: string
  min: number
  max: number
  step: number
  direction: "up" | "down"
  icon: LucideIcon
  color: string
}

const TARGETS: TargetDefinition[] = [
  {
    category: "calories",
    label: "Daily calories",
    description: "Drives the calorie ring, remaining intake, and food panel.",
    unit: "cal",
    min: 500,
    max: 50000,
    step: 50,
    direction: "down",
    icon: Flame,
    color: "#ef4444",
  },
  {
    category: "steps",
    label: "Daily steps",
    description: "Used by the overview ring, activity bars, and reminders.",
    unit: "steps",
    min: 500,
    max: 200000,
    step: 500,
    direction: "up",
    icon: Footprints,
    color: "#22c55e",
  },
  {
    category: "sleep",
    label: "Nightly sleep",
    description: "Sets the sleep ring target and goal-night calculations.",
    unit: "hrs",
    min: 1,
    max: 16,
    step: 0.25,
    direction: "up",
    icon: MoonStar,
    color: "#8b5cf6",
  },
  {
    category: "water",
    label: "Daily water",
    description: "Controls bottle progress and remaining hydration.",
    unit: "oz",
    min: 8,
    max: 512,
    step: 1,
    direction: "up",
    icon: Droplets,
    color: "#22d3ee",
  },
  {
    category: "recovery",
    label: "Recovery score",
    description: "Sets the daily recovery target on the 10-point scale.",
    unit: "/10",
    min: 1,
    max: 10,
    step: 0.5,
    direction: "up",
    icon: Activity,
    color: "#c4d632",
  },
]

type TargetInputs = Record<CoreTrackingTarget, string>
type ActiveGoals = Partial<Record<CoreTrackingTarget, GoalRow>>

function defaultInputs(): TargetInputs {
  return {
    calories: String(TRACKING_TARGET_DEFAULTS.calories),
    steps: String(TRACKING_TARGET_DEFAULTS.steps),
    sleep: String(TRACKING_TARGET_DEFAULTS.sleep),
    water: String(TRACKING_TARGET_DEFAULTS.water),
    recovery: String(TRACKING_TARGET_DEFAULTS.recovery),
  }
}

function displayTarget(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

export function TrackingTargetSettings() {
  const { user } = useUser()
  const [goals, setGoals] = useState<ActiveGoals>({})
  const [inputs, setInputs] = useState<TargetInputs>(defaultInputs)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch("/api/goals", { cache: "no-store" })
      if (!response.ok) throw new Error("Could not load targets.")
      const rows = (await response.json()) as GoalRow[]
      const active: ActiveGoals = {}
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!row.active || !(row.category in TRACKING_TARGET_DEFAULTS)) continue
        const category = row.category as CoreTrackingTarget
        if (!active[category]) active[category] = row
      }
      const next = defaultInputs()
      for (const definition of TARGETS) {
        const saved = active[definition.category]
        if (saved && Number.isFinite(saved.target) && saved.target > 0) {
          next[definition.category] = displayTarget(saved.target)
        }
      }
      setGoals(active)
      setInputs(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load targets.")
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void load()
  }, [load])

  const validationError = useMemo(() => {
    for (const definition of TARGETS) {
      const value = Number(inputs[definition.category])
      if (!Number.isFinite(value) || value < definition.min || value > definition.max) {
        return `${definition.label} must be between ${definition.min.toLocaleString()} and ${definition.max.toLocaleString()}.`
      }
    }
    return ""
  }, [inputs])

  const dirty = TARGETS.some((definition) => {
    const saved = goals[definition.category]?.target ?? TRACKING_TARGET_DEFAULTS[definition.category]
    return Number(inputs[definition.category]) !== saved
  })

  async function save() {
    if (!user?.id || busy || validationError) {
      setError(validationError)
      return
    }
    setBusy(true)
    setMessage("")
    setError("")
    try {
      const changed = TARGETS.filter((definition) => {
        const saved = goals[definition.category]?.target ?? TRACKING_TARGET_DEFAULTS[definition.category]
        return Number(inputs[definition.category]) !== saved
      })
      const savedRows = await Promise.all(
        changed.map(async (definition) => {
          const existing = goals[definition.category]
          const response = await apiFetch("/api/goals", {
            method: existing ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(existing ? { id: existing.id } : { category: definition.category }),
              goalType: "daily",
              direction: definition.direction,
              target: Number(inputs[definition.category]),
              unit: definition.unit,
              active: true,
            }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) {
            throw new Error(typeof data.error === "string" ? data.error : `Could not save ${definition.label}.`)
          }
          return [definition.category, data as GoalRow] as const
        }),
      )
      setGoals((current) => {
        const next = { ...current }
        for (const [category, row] of savedRows) next[category] = row
        return next
      })
      setMessage(changed.length ? "Targets saved. Dashboard progress now uses these values." : "Targets are already up to date.")
      window.dispatchEvent(new CustomEvent("grid:goals-updated"))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save targets.")
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {TARGETS.map((definition) => {
          const Icon = definition.icon
          return (
            <div
              key={definition.category}
              className="rounded-xl border border-border/30 bg-muted/[0.08] p-3.5"
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                  style={{
                    borderColor: `${definition.color}30`,
                    backgroundColor: `${definition.color}12`,
                  }}
                >
                  <Icon className="h-4 w-4" style={{ color: definition.color }} />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <Label htmlFor={`target-${definition.category}`} className="text-sm font-semibold text-foreground">
                      {definition.label}
                    </Label>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/70">
                      {definition.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`target-${definition.category}`}
                      type="number"
                      inputMode="decimal"
                      min={definition.min}
                      max={definition.max}
                      step={definition.step}
                      value={inputs[definition.category]}
                      onChange={(event) => {
                        setInputs((current) => ({ ...current, [definition.category]: event.target.value }))
                        setMessage("")
                        setError("")
                      }}
                      disabled={loading || busy}
                      className="h-10 min-w-0 flex-1 tabular-nums"
                    />
                    <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {definition.unit}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="glass" size="sm" onClick={() => void save()} disabled={loading || busy || !dirty || Boolean(validationError)}>
          <Save className="h-3.5 w-3.5" />
          {busy ? "Saving…" : "Save targets"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || busy}
          onClick={() => {
            setInputs(defaultInputs())
            setMessage("")
            setError("")
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restore defaults
        </Button>
      </div>

      {(error || validationError) && (
        <p className="text-[11px] leading-snug text-destructive" role="alert">
          {error || validationError}
        </p>
      )}
      {message && <p className="text-[11px] leading-snug text-primary/90">{message}</p>}
    </div>
  )
}
