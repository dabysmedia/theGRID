"use client"

import { useEffect, useState } from "react"
import {
  Target,
  Trash2,
  Plus,
  Weight,
  Timer,
  Dumbbell,
  Crosshair,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react"
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from "recharts"
import { PageHeader } from "@/components/PageHeader"
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { apiFetch } from "@/lib/api-fetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CATEGORY_THEME } from "@/lib/category-theme"
import {
  cn,
  formatDate,
  glassPanelAccentClass,
  glassPanelAccentStyle,
  glassPanelClass,
} from "@/lib/utils"
import { DEFAULT_WEIGHT_UNIT } from "@/lib/units"

const GOALS_THEME = CATEGORY_THEME.goals

interface GoalEntry {
  id: string
  goalId: string
  date: string
  value: number
  notes: string | null
  createdAt: string
}

interface LongGoal {
  id: string
  name: string
  category: string
  target: number
  unit: string
  direction: string
  startValue: number | null
  active: boolean
  createdAt: string
  entries: GoalEntry[]
}

const presets = [
  { category: "bodyweight", name: "Bodyweight", unit: DEFAULT_WEIGHT_UNIT, direction: "down", icon: Weight, color: "#22c55e" },
  { category: "mile_time", name: "Mile Time", unit: "min", direction: "down", icon: Timer, color: "#3b82f6" },
  { category: "pushups", name: "Pushups", unit: "reps", direction: "up", icon: Dumbbell, color: "#a855f7" },
  { category: "bench_press", name: "Bench Press", unit: DEFAULT_WEIGHT_UNIT, direction: "up", icon: Dumbbell, color: "#ef4444" },
]

function getGoalIcon(category: string) {
  const preset = presets.find((p) => p.category === category)
  return preset?.icon ?? Crosshair
}

function getGoalColor(category: string) {
  const preset = presets.find((p) => p.category === category)
  return preset?.color ?? "oklch(0.82 0.18 110)"
}

function progressPercent(goal: LongGoal): number | null {
  if (!goal.entries.length || goal.startValue == null) return null
  const latest = goal.entries[0].value
  const totalDelta = Math.abs(goal.target - goal.startValue)
  if (totalDelta === 0) return 100
  const currentDelta =
    goal.direction === "down"
      ? goal.startValue - latest
      : latest - goal.startValue
  return Math.min(Math.max((currentDelta / totalDelta) * 100, 0), 100)
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<LongGoal[]>([])
  const [showForm, setShowForm] = useState(false)
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null)

  // New goal form state
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [customName, setCustomName] = useState("")
  const [goalTarget, setGoalTarget] = useState("")
  const [goalUnit, setGoalUnit] = useState("")
  const [goalDirection, setGoalDirection] = useState<"up" | "down">("up")
  const [goalStart, setGoalStart] = useState("")

  // Log entry state (keyed by goal id)
  const [logValue, setLogValue] = useState<Record<string, string>>({})
  const [logNotes, setLogNotes] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch("/api/long-goals")
      .then(async (r) => {
        const data = await r.json()
        setGoals(Array.isArray(data) ? data : [])
      })
      .catch(() => setGoals([]))
  }, [])

  function resetForm() {
    setSelectedPreset(null)
    setCustomName("")
    setGoalTarget("")
    setGoalUnit("")
    setGoalDirection("up")
    setGoalStart("")
    setFormError(null)
    setShowForm(false)
  }

  function selectPreset(category: string) {
    const preset = presets.find((p) => p.category === category)
    if (!preset) return
    setSelectedPreset(category)
    setGoalUnit(preset.unit)
    setGoalDirection(preset.direction as "up" | "down")
    setCustomName("")
  }

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!goalTarget.trim()) {
      setFormError("Enter a target value.")
      return
    }
    const targetNum = parseFloat(goalTarget)
    if (Number.isNaN(targetNum)) {
      setFormError("Target must be a number.")
      return
    }

    const name = selectedPreset
      ? presets.find((p) => p.category === selectedPreset)!.name
      : customName.trim()
    if (!name) {
      setFormError("Choose a goal type or enter a name under Other.")
      return
    }
    if (!goalUnit.trim()) {
      setFormError(`Enter a unit (e.g. ${DEFAULT_WEIGHT_UNIT}, min, reps).`)
      return
    }

    const res = await apiFetch("/api/long-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category: selectedPreset ?? "other",
        target: goalTarget,
        unit: goalUnit.trim(),
        direction: goalDirection,
        startValue: goalStart || null,
      }),
    })

    if (res.ok) {
      const goal = await res.json()
      const normalized: LongGoal = {
        ...goal,
        entries: Array.isArray(goal.entries) ? goal.entries : [],
      }
      setGoals([normalized, ...goals])
      resetForm()
    } else {
      let message = "Could not create goal."
      try {
        const err = await res.json()
        if (err && typeof err.error === "string") message = err.error
      } catch {
        /* ignore */
      }
      setFormError(message)
    }
  }

  async function handleLogEntry(goalId: string) {
    const value = logValue[goalId]
    if (!value) return

    const res = await apiFetch("/api/long-goals/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalId,
        date: formatDate(new Date()),
        value,
        notes: logNotes[goalId] || null,
      }),
    })

    if (res.ok) {
      const entry = await res.json()
      setGoals(
        goals.map((g) =>
          g.id === goalId ? { ...g, entries: [entry, ...g.entries] } : g
        )
      )
      setLogValue((prev) => ({ ...prev, [goalId]: "" }))
      setLogNotes((prev) => ({ ...prev, [goalId]: "" }))
    }
  }

  async function handleDeleteEntry(goalId: string, entryId: string) {
    const res = await apiFetch(`/api/long-goals/entries?id=${entryId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      setGoals(
        goals.map((g) =>
          g.id === goalId
            ? { ...g, entries: g.entries.filter((e) => e.id !== entryId) }
            : g
        )
      )
    }
  }

  async function handleDeleteGoal(id: string) {
    const res = await apiFetch(`/api/long-goals?id=${id}`, { method: "DELETE" })
    if (res.ok) setGoals(goals.filter((g) => g.id !== id))
  }

  const activeCount = goals.length
  const avgProgress = (() => {
    const pcts = goals
      .map((g) => progressPercent(g))
      .filter((p): p is number => p != null)
    if (!pcts.length) return null
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
  })()

  return (
    <div className="space-y-6">
      <PageHeader title="Goals" />

      <PageHeroStrip
        color={GOALS_THEME.color}
        icon={Target}
        eyebrow="Long-term targets"
        value={activeCount === 0 ? "—" : String(activeCount)}
        unit={activeCount === 0 ? undefined : "active"}
        hint={avgProgress != null ? `${avgProgress}% avg progress` : "set a target"}
        metrics={[
          { label: "Active", value: String(activeCount) },
          {
            label: "Avg progress",
            value: avgProgress != null ? `${avgProgress}%` : "—",
          },
          {
            label: "Logged",
            value: String(goals.reduce((n, g) => n + g.entries.length, 0)),
          },
        ]}
      />

      {/* Create button or form */}
      {!showForm ? (
        <Button
          onClick={() => {
            selectPreset(presets[0].category)
            setFormError(null)
            setShowForm(true)
          }}
          className="w-full"
          variant="glass"
          size="lg"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Goal
        </Button>
      ) : (
        <div className={cn(glassPanelClass, "animate-fade-up p-5")}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="type-hud-rail text-foreground">Create Goal</h2>
            <button
              onClick={resetForm}
              className="p-1.5 rounded-lg hover:bg-glass-highlight/40 transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Preset picker */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {presets.map((p) => (
              <button
                key={p.category}
                type="button"
                onClick={() => selectPreset(p.category)}
                className={`flex items-center gap-2.5 rounded-xl p-3 transition-all duration-200 text-left ${
                  selectedPreset === p.category
                    ? "glass border-primary/30 ring-1 ring-primary/20"
                    : "glass-subtle hover:bg-glass-highlight/30"
                }`}
              >
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                  style={{ backgroundColor: `${p.color}18` }}
                >
                  <p.icon className="h-4 w-4" style={{ color: p.color }} />
                </div>
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.unit}</p>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setSelectedPreset(null)
                setCustomName("")
                setGoalUnit("")
                setGoalDirection("up")
              }}
              className={`flex items-center gap-2.5 rounded-xl p-3 transition-all duration-200 text-left col-span-2 ${
                selectedPreset === null && showForm
                  ? "glass border-primary/30 ring-1 ring-primary/20"
                  : "glass-subtle hover:bg-glass-highlight/30"
              }`}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 bg-primary/10">
                <Crosshair className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Other</p>
                <p className="text-[10px] text-muted-foreground">
                  Custom goal
                </p>
              </div>
            </button>
          </div>

          <form onSubmit={handleCreateGoal} className="space-y-3">
            {/* Custom name when "other" */}
            {selectedPreset === null && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Goal Name
                </Label>
                <Input
                  placeholder="e.g. Pull-ups, 5K Time"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Target
                </Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="e.g. 80"
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Unit
                </Label>
                <Input
                  placeholder={`${DEFAULT_WEIGHT_UNIT}, min, reps`}
                  value={goalUnit}
                  onChange={(e) => setGoalUnit(e.target.value)}
                  required={selectedPreset === null}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Starting Value
                </Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="Current"
                  value={goalStart}
                  onChange={(e) => setGoalStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Direction
                </Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={goalDirection === "up" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setGoalDirection("up")}
                  >
                    <ArrowUp className="h-3.5 w-3.5 mr-1" />
                    Up
                  </Button>
                  <Button
                    type="button"
                    variant={goalDirection === "down" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setGoalDirection("down")}
                  >
                    <ArrowDown className="h-3.5 w-3.5 mr-1" />
                    Down
                  </Button>
                </div>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <Button type="submit" variant="glass" className="w-full" size="lg">
              Create Goal
            </Button>
          </form>
        </div>
      )}

      {/* Goal cards */}
      <div className="space-y-4">
        {goals.length === 0 && !showForm && (
          <div className={cn(glassPanelClass, "p-8 text-center")}>
            <Target className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="type-hud-caption normal-case text-muted-foreground">
              No goals yet. Create one to start tracking progress.
            </p>
          </div>
        )}

        {goals.map((goal, idx) => {
          const Icon = getGoalIcon(goal.category)
          const color = getGoalColor(goal.category)
          const pct = progressPercent(goal)
          const latest = goal.entries[0]?.value ?? null
          const isExpanded = expandedGoal === goal.id
          const chartData = [...goal.entries]
            .reverse()
            .map((e) => ({ value: e.value, date: e.date.split("T")[0] }))

          return (
            <div
              key={goal.id}
              className={cn(
                glassPanelClass,
                glassPanelAccentClass,
                "animate-fade-up overflow-hidden",
              )}
              style={{
                ...glassPanelAccentStyle(color),
                animationDelay: `${idx * 40}ms`,
              }}
            >
              {/* Goal header */}
              <div className="p-4 lg:p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
                      style={{
                        backgroundColor: `${color}18`,
                        borderColor: `${color}33`,
                      }}
                    >
                      <Icon className="h-5 w-5" style={{ color }} />
                    </div>
                    <div>
                      <h3 className="font-heading text-sm font-semibold">{goal.name}</h3>
                      <p className="type-hud-caption mt-0.5 normal-case text-muted-foreground">
                        Target: {goal.target} {goal.unit}{" "}
                        <span className="inline-flex items-center gap-0.5">
                          {goal.direction === "up" ? (
                            <ArrowUp className="h-2.5 w-2.5" />
                          ) : (
                            <ArrowDown className="h-2.5 w-2.5" />
                          )}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteGoal(goal.id)}
                    className="rounded-xl p-1.5 transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </button>
                </div>

                {/* Current / progress row */}
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="type-hud-label-soft mb-0.5">
                      {latest != null ? "Latest" : "No entries"}
                    </p>
                    <p className="type-hud-value-lg tabular-nums tracking-tight">
                      {latest != null ? latest : "—"}
                      {latest != null && (
                        <span className="type-hud-unit ml-1">{goal.unit}</span>
                      )}
                    </p>
                  </div>
                  {pct != null && (
                    <div className="text-right">
                      <p className="type-hud-label-soft mb-0.5">Progress</p>
                      <p className="type-hud-stat text-lg" style={{ color }}>
                        {Math.round(pct)}%
                      </p>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {pct != null && (
                  <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden mb-3">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                )}

                {/* Mini chart */}
                {chartData.length >= 2 && (
                  <div className="h-16 w-full mb-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
                      >
                        <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                        <Tooltip
                          contentStyle={{
                            background: "oklch(0.19 0.012 250 / 98%)",
                            border: "1px solid oklch(1 0 0 / 8%)",
                            borderRadius: "8px",
                            fontSize: "12px",
                            backdropFilter: "blur(8px)",
                          }}
                          labelStyle={{ color: "oklch(0.60 0.01 250)" }}
                          formatter={(val) => [
                            `${val} ${goal.unit}`,
                            goal.name,
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={color}
                          strokeWidth={2}
                          dot={{ r: 3, fill: color, strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: color, strokeWidth: 2, stroke: "#fff" }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Quick log */}
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="any"
                    placeholder={`Log ${goal.unit}`}
                    value={logValue[goal.id] ?? ""}
                    onChange={(e) =>
                      setLogValue((prev) => ({
                        ...prev,
                        [goal.id]: e.target.value,
                      }))
                    }
                    className="flex-1"
                  />
                  <Button
                    onClick={() => handleLogEntry(goal.id)}
                    disabled={!logValue[goal.id]}
                    size="default"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Expandable history */}
              {goal.entries.length > 0 && (
                <>
                  <button
                    onClick={() =>
                      setExpandedGoal(isExpanded ? null : goal.id)
                    }
                    className="type-hud-chip flex w-full items-center justify-center gap-1.5 border-t border-glass-border py-2.5 text-muted-foreground transition-colors hover:bg-glass-highlight/30"
                  >
                    {isExpanded ? "Hide" : "Show"} History ({goal.entries.length})
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-glass-border px-4 lg:px-5 py-3 space-y-2 max-h-64 overflow-y-auto">
                      {goal.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground/60 tabular-nums w-20">
                              {entry.date.split("T")[0]}
                            </span>
                            <span className="text-sm font-semibold tabular-nums">
                              {entry.value} {goal.unit}
                            </span>
                            {entry.notes && (
                              <span className="text-xs text-muted-foreground/50 truncate max-w-[120px]">
                                {entry.notes}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              handleDeleteEntry(goal.id, entry.id)
                            }
                            className="history-row-delete"
                            aria-label="Delete goal entry"
                          >
                            <Trash2 />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
