"use client"

import { useEffect, useState, useCallback } from "react"
import { Target, Pencil, Check, X, Trash2, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { apiFetch } from "@/lib/api-fetch"

export interface GoalPreset {
  type: string
  label: string
  unit: string
  placeholder: string
  direction?: "up" | "down"
}

interface CategoryGoalProps {
  category: string
  values: Record<string, number>
  presets: GoalPreset[]
  color?: string
}

interface GoalData {
  id: string
  goalType: string
  direction: string
  target: number
  unit: string
}

function formatPaceValue(minutes: number): string {
  if (!minutes || minutes <= 0) return "—"
  const m = Math.floor(minutes)
  const s = Math.round((minutes - m) * 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function parsePaceInput(input: string): number | null {
  if (input.includes(":")) {
    const [m, s] = input.split(":")
    const mins = parseInt(m)
    const secs = parseInt(s || "0")
    if (Number.isNaN(mins)) return null
    return mins + secs / 60
  }
  const v = parseFloat(input)
  return Number.isNaN(v) ? null : v
}

function computeProgress(
  current: number,
  target: number,
  direction: string
): number {
  if (target <= 0) return 0
  if (direction === "down") {
    if (current <= 0) return 100
    if (current <= target) return 100
    return Math.min((target / current) * 100, 100)
  }
  return Math.min((current / target) * 100, 100)
}

function isGoalComplete(current: number, target: number, direction: string): boolean {
  if (target <= 0) return false
  if (direction === "down") return current <= target && current > 0
  return current >= target
}

function formatDisplayValue(value: number, goalType: string): string {
  if (goalType === "pace") return formatPaceValue(value)
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`
  if (Number.isInteger(value)) return value.toLocaleString()
  return (Math.round(value * 10) / 10).toLocaleString()
}

export function CategoryGoal({
  category,
  values,
  presets,
  color = "oklch(0.82 0.18 110)",
}: CategoryGoalProps) {
  const [goal, setGoal] = useState<GoalData | null>(null)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<GoalPreset | null>(null)
  const [targetInput, setTargetInput] = useState("")
  const [loaded, setLoaded] = useState(false)

  const fetchGoal = useCallback(() => {
    apiFetch(`/api/goals?category=${category}`)
      .then(async (r) => {
        const data = await r.json()
        if (data && data.id) {
          setGoal(data)
          setTargetInput(
            data.goalType === "pace"
              ? formatPaceValue(data.target)
              : String(data.target)
          )
        } else {
          setGoal(null)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [category])

  useEffect(() => {
    fetchGoal()
  }, [fetchGoal])

  const activePreset = goal
    ? presets.find((p) => p.type === goal.goalType) ?? presets[0]
    : selectedPreset

  const currentValue = goal
    ? (values[goal.goalType] ?? 0)
    : 0

  async function handleSave() {
    const preset = activePreset
    if (!preset) return

    let val: number | null
    if (preset.type === "pace") {
      val = parsePaceInput(targetInput)
    } else {
      val = parseFloat(targetInput)
    }
    if (val == null || val <= 0) return

    const method = goal ? "PUT" : "POST"
    const payload = goal
      ? {
          id: goal.id,
          target: val,
          unit: preset.unit,
          goalType: preset.type,
          direction: preset.direction ?? "up",
        }
      : {
          category,
          goalType: preset.type,
          direction: preset.direction ?? "up",
          target: val,
          unit: preset.unit,
          active: true,
        }

    const res = await apiFetch("/api/goals", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const saved = await res.json()
      setGoal(saved)
      setEditing(false)
      setPicking(false)
      setSelectedPreset(null)
    }
  }

  async function handleDelete() {
    if (!goal) return
    const res = await apiFetch(`/api/goals?id=${goal.id}`, { method: "DELETE" })
    if (res.ok) {
      setGoal(null)
      setTargetInput("")
      setEditing(false)
      setPicking(false)
      setSelectedPreset(null)
    }
  }

  function handleCancel() {
    setEditing(false)
    setPicking(false)
    setSelectedPreset(null)
    if (goal) {
      setTargetInput(
        goal.goalType === "pace"
          ? formatPaceValue(goal.target)
          : String(goal.target)
      )
    }
  }

  function handlePickPreset(preset: GoalPreset) {
    setSelectedPreset(preset)
    setTargetInput("")
    setPicking(false)
    setEditing(true)
  }

  function handleStartEdit() {
    setSelectedPreset(
      presets.find((p) => p.type === goal?.goalType) ?? presets[0]
    )
    setEditing(true)
  }

  function handleChangeType() {
    setPicking(true)
    setEditing(false)
  }

  if (!loaded) return null

  const pct = goal
    ? computeProgress(currentValue, goal.target, goal.direction)
    : 0
  const complete = goal
    ? isGoalComplete(currentValue, goal.target, goal.direction)
    : false

  // --- Preset picker ---
  if (picking || (!goal && !editing && !picking)) {
    if (picking) {
      return (
        <div className="glass-subtle rounded-xl px-3.5 py-3 animate-fade-up space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5" style={{ color }} />
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Choose goal type
              </span>
            </div>
            <button
              onClick={handleCancel}
              className="p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.type}
                onClick={() => handlePickPreset(p)}
                className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] rounded-md border border-glass-border text-muted-foreground/70 hover:text-foreground hover:bg-grid-accent-dim transition-colors"
              >
                {p.label}
                <span className="text-muted-foreground/30 ml-1 normal-case lowercase">
                  {p.unit}
                </span>
              </button>
            ))}
          </div>
        </div>
      )
    }

    // No goal, show "Set a goal"
    return (
      <div className="glass-subtle rounded-xl px-3.5 py-3 animate-fade-up">
        <button
          onClick={() => {
            if (presets.length === 1) {
              handlePickPreset(presets[0])
            } else {
              setPicking(true)
            }
          }}
          className="w-full flex items-center justify-center gap-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <Target className="h-3 w-3" />
          Set a goal
        </button>
      </div>
    )
  }

  // --- Editing ---
  if (editing && activePreset) {
    return (
      <div className="glass-subtle rounded-xl px-3.5 py-3 animate-fade-up space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Target className="h-3.5 w-3.5 shrink-0" style={{ color }} />
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground shrink-0">
            {activePreset.label}
          </span>
          {presets.length > 1 && (
            <button
              onClick={handleChangeType}
              className="text-[9px] uppercase tracking-wider text-primary/50 hover:text-primary flex items-center gap-0.5 transition-colors"
            >
              change
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type={activePreset.type === "pace" ? "text" : "number"}
            min="0"
            step="any"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
            placeholder={activePreset.placeholder}
            className="h-7 w-28 text-xs bg-background/40 border-primary/15"
            autoFocus
          />
          <span className="text-[10px] text-muted-foreground/50 shrink-0">{activePreset.unit}</span>
          {activePreset.direction === "down" && (
            <span className="text-[9px] text-muted-foreground/30 italic shrink-0">or less</span>
          )}
          <div className="flex items-center gap-0.5 ml-auto">
            <button
              onClick={handleSave}
              className="p-1 text-primary hover:bg-primary/10 rounded-md transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1 text-muted-foreground/50 hover:text-muted-foreground rounded-md transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {goal && (
              <button
                onClick={handleDelete}
                className="p-1 text-muted-foreground/30 hover:text-destructive rounded-md transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- Active goal display ---
  if (goal && activePreset) {
    const displayCurrent = formatDisplayValue(currentValue, goal.goalType)
    const displayTarget = formatDisplayValue(goal.target, goal.goalType)

    return (
      <div className="glass-subtle rounded-xl px-3.5 py-3 animate-fade-up space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5" style={{ color }} />
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {activePreset.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tabular-nums">
              {displayCurrent}
              <span className="text-muted-foreground/50 font-medium">
                {" "}
                {goal.direction === "down" ? "→" : "/"} {displayTarget}
              </span>
              <span className="text-[10px] text-muted-foreground/40 ml-1">
                {goal.unit}
              </span>
            </span>
            <button
              onClick={handleStartEdit}
              className="p-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="h-1.5 w-full bg-muted/20 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-700 ease-out rounded-full"
            style={{
              width: `${pct}%`,
              backgroundColor: complete
                ? color
                : `color-mix(in oklch, ${color} 80%, transparent)`,
              boxShadow:
                pct > 0
                  ? `0 0 8px color-mix(in oklch, ${color} 30%, transparent)`
                  : "none",
            }}
          />
        </div>
        {complete && (
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-center animate-count-up"
            style={{ color }}
          >
            Goal reached
          </p>
        )}
      </div>
    )
  }

  return null
}
