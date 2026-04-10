"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { apiFetch } from "@/lib/api-fetch"
import {
  CheckSquare,
  Plus,
  X,
  Trash2,
  Flame,
  Droplets,
  BookOpen,
  Dumbbell,
  Moon,
  Pill,
  Apple,
  Heart,
  Brain,
  Eye,
  Star,
  Zap,
  Sun,
  Coffee,
  Check,
  Trophy,
  TrendingUp,
  Pencil,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useActiveDate } from "@/context/DateContext"
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns"

const ICON_MAP: Record<string, LucideIcon> = {
  check: CheckSquare,
  flame: Flame,
  droplets: Droplets,
  book: BookOpen,
  dumbbell: Dumbbell,
  moon: Moon,
  pill: Pill,
  apple: Apple,
  heart: Heart,
  brain: Brain,
  eye: Eye,
  star: Star,
  zap: Zap,
  sun: Sun,
  coffee: Coffee,
}

const ICON_OPTIONS = Object.keys(ICON_MAP)

const COLOR_OPTIONS = [
  "#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#f59e0b",
  "#6366f1", "#14b8a6", "#ec4899", "#78716c", "#f97316",
]

interface HabitCompletion {
  id: string
  habitId: string
  date: string
  createdAt: string
}

interface Habit {
  id: string
  name: string
  icon: string
  color: string
  frequency: string
  archived: boolean
  sortOrder: number
  createdAt: string
  completions: HabitCompletion[]
}

function dateKey(d: Date | string): string {
  if (typeof d === "string") return d.split("T")[0]
  return format(d, "yyyy-MM-dd")
}

function getStreak(completions: HabitCompletion[]): number {
  if (completions.length === 0) return 0
  const dates = new Set(completions.map((c) => dateKey(c.date)))
  let streak = 0
  let d = new Date()
  if (!dates.has(dateKey(d))) d = subDays(d, 1)
  while (dates.has(dateKey(d))) {
    streak++
    d = subDays(d, 1)
  }
  return streak
}

function getLongestStreak(completions: HabitCompletion[]): number {
  if (completions.length === 0) return 0
  const sorted = [...new Set(completions.map((c) => dateKey(c.date)))].sort()
  let max = 1
  let current = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + "T12:00:00")
    const curr = new Date(sorted[i] + "T12:00:00")
    const diff = (curr.getTime() - prev.getTime()) / 86400000
    if (Math.round(diff) === 1) {
      current++
      if (current > max) max = current
    } else {
      current = 1
    }
  }
  return max
}

function getMonthRate(completions: HabitCompletion[], monthDays: Date[], todayStr: string): number {
  const dates = new Set(completions.map((c) => dateKey(c.date)))
  const pastDays = monthDays.filter((d) => dateKey(d) <= todayStr)
  if (pastDays.length === 0) return 0
  let count = 0
  for (const d of pastDays) {
    if (dates.has(dateKey(d))) count++
  }
  return Math.round((count / pastDays.length) * 100)
}

function NewHabitCTA({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="ghost"
      size="sm"
      className={cn(
        "glass relative h-10 min-h-10 w-full justify-center gap-2 overflow-hidden rounded-xl px-3.5 text-foreground shadow-md shadow-black/25 ring-1 ring-white/10 hud-corners",
        "hover:bg-glass-highlight/25",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.82_0.18_110_/_35%)] to-transparent" />
      <span className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-glass-highlight/35 ring-1 ring-white/5 backdrop-blur-sm">
        <Plus className="h-3.5 w-3.5 text-grid-accent" strokeWidth={2.5} />
      </span>
      <span className="relative z-[1] text-gradient text-sm font-semibold tracking-wide">New Habit</span>
    </Button>
  )
}

export default function HabitsPage() {
  const { activeDate } = useActiveDate()
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)

  const [formName, setFormName] = useState("")
  const [formIcon, setFormIcon] = useState("check")
  const [formColor, setFormColor] = useState("#22c55e")
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const fetchHabits = useCallback(async () => {
    try {
      const res = await apiFetch("/api/habits")
      if (res.ok) setHabits(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHabits() }, [fetchHabits])

  const todayStr = activeDate
  const todayRealStr = dateKey(new Date())

  const calendarMonth = useMemo(() => {
    const ref = new Date(todayStr + "T12:00:00")
    return eachDayOfInterval({ start: startOfMonth(ref), end: endOfMonth(ref) })
  }, [todayStr])

  const firstDayOffset = getDay(calendarMonth[0])

  const completionMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const h of habits) {
      map.set(h.id, new Set(h.completions.map((c) => dateKey(c.date))))
    }
    return map
  }, [habits])

  const completedToday = useMemo(() => {
    const set = new Set<string>()
    for (const h of habits) {
      if (completionMap.get(h.id)?.has(todayStr)) set.add(h.id)
    }
    return set
  }, [habits, completionMap, todayStr])

  function openCreate() {
    setEditingHabit(null)
    setFormName("")
    setFormIcon("check")
    setFormColor("#22c55e")
    setDeleteConfirm(false)
    setShowForm(true)
  }

  function openEdit(habit: Habit) {
    setEditingHabit(habit)
    setFormName(habit.name)
    setFormIcon(habit.icon)
    setFormColor(habit.color)
    setDeleteConfirm(false)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingHabit(null)
    setDeleteConfirm(false)
  }

  async function toggleHabit(habitId: string) {
    const res = await apiFetch("/api/habits/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ habitId, date: todayStr }),
    })
    if (res.ok) {
      const result = await res.json()
      setHabits((prev) =>
        prev.map((h) => {
          if (h.id !== habitId) return h
          if (result.completed) {
            return {
              ...h,
              completions: [
                { id: result.id, habitId, date: todayStr + "T12:00:00.000Z", createdAt: new Date().toISOString() },
                ...h.completions,
              ],
            }
          }
          return { ...h, completions: h.completions.filter((c) => dateKey(c.date) !== todayStr) }
        })
      )
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) return

    if (editingHabit) {
      const res = await apiFetch("/api/habits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingHabit.id, name: formName.trim(), icon: formIcon, color: formColor }),
      })
      if (res.ok) {
        const updated = await res.json()
        setHabits((prev) => prev.map((h) => h.id === updated.id ? updated : h))
        closeForm()
      }
    } else {
      const res = await apiFetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), icon: formIcon, color: formColor }),
      })
      if (res.ok) {
        const habit = await res.json()
        setHabits((prev) => [...prev, habit])
        closeForm()
      }
    }
  }

  async function confirmDeleteHabit() {
    if (!editingHabit) return
    const res = await apiFetch(`/api/habits?id=${editingHabit.id}`, { method: "DELETE" })
    if (res.ok) {
      setHabits((prev) => prev.filter((h) => h.id !== editingHabit.id))
      closeForm()
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Habits" icon={CheckSquare} iconColor="#22c55e" />

      {/* Habit cards */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : habits.length === 0 ? (
        <div className="glass animate-fade-up rounded-2xl p-6 text-center">
          <CheckSquare className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground mb-4">No habits yet. Add your first one to get started.</p>
          {!showForm && <NewHabitCTA onClick={openCreate} />}
        </div>
      ) : (
        <div className="space-y-2">
          {habits.map((habit, idx) => {
            const Icon = ICON_MAP[habit.icon] ?? CheckSquare
            const done = completedToday.has(habit.id)
            const dates = completionMap.get(habit.id) ?? new Set<string>()
            const streak = getStreak(habit.completions)
            const best = getLongestStreak(habit.completions)
            const monthRate = getMonthRate(habit.completions, calendarMonth, todayRealStr)

            return (
              <div
                key={habit.id}
                className="glass animate-fade-up space-y-1.5 rounded-xl px-2.5 py-2"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                {/* Header: check + name + stats + edit */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleHabit(habit.id)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-300 active:scale-90 ${
                      done ? "" : "hover:scale-105"
                    }`}
                    style={{
                      backgroundColor: done ? habit.color : `${habit.color}15`,
                    }}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    ) : (
                      <Icon className="h-3.5 w-3.5" style={{ color: habit.color }} strokeWidth={1.8} />
                    )}
                  </button>

                  <span className={`flex-1 text-xs font-medium tracking-wide min-w-0 truncate ${done ? "line-through text-muted-foreground/50" : ""}`}>
                    {habit.name}
                  </span>

                  {streak > 0 && (
                    <div className="flex items-center gap-0.5 shrink-0" title="Streak">
                      <Flame className="h-2.5 w-2.5 text-orange-400" />
                      <span className="text-[9px] font-bold tabular-nums">{streak}</span>
                    </div>
                  )}
                  {best > 0 && (
                    <div className="flex items-center gap-0.5 shrink-0 text-muted-foreground/45" title="Best">
                      <Trophy className="h-2.5 w-2.5" />
                      <span className="text-[9px] tabular-nums">{best}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0 text-primary" title="Month completion">
                    <TrendingUp className="h-2.5 w-2.5" />
                    <span className="text-[9px] font-semibold tabular-nums">{monthRate}%</span>
                  </div>

                  <button
                    onClick={() => openEdit(habit)}
                    className="shrink-0 rounded-md p-0.5 opacity-35 transition-colors hover:bg-glass-highlight/40 hover:opacity-100"
                    title="Edit"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                </div>

                {/* Compact month calendar */}
                <div className="grid grid-cols-7 gap-[1px]">
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
                    <div key={i} className="text-[6px] text-center text-muted-foreground/30 font-medium leading-none pb-[1px]">
                      {day}
                    </div>
                  ))}
                  {Array.from({ length: firstDayOffset }).map((_, i) => (
                    <div key={`p-${i}`} />
                  ))}
                  {calendarMonth.map((day) => {
                    const dk = dateKey(day)
                    const isDone = dates.has(dk)
                    const isActive = dk === todayStr
                    const isFuture = dk > todayRealStr
                    return (
                      <div
                        key={dk}
                        className={`h-5 flex items-center justify-center text-[9px] tabular-nums leading-none ${
                          isFuture ? "text-muted-foreground/12" : isActive && !isDone ? "ring-1 ring-primary/35" : ""
                        }`}
                        style={{
                          borderRadius: "3px",
                          backgroundColor: isDone ? habit.color : isFuture ? "transparent" : "oklch(1 0 0 / 3%)",
                          color: isDone ? "#fff" : undefined,
                          fontWeight: isDone || isActive ? 700 : 400,
                        }}
                      >
                        {format(day, "d")}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {!showForm && <NewHabitCTA onClick={openCreate} className="mt-1" />}
        </div>
      )}

      {/* Create / Edit form (bottom sheet) */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in px-4" onClick={closeForm}>
          <div
            className="glass-frost animate-scale-in w-full max-w-[400px] space-y-3 rounded-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em]">
                {editingHabit ? "Edit Habit" : "New Habit"}
              </h2>
              <button
                onClick={closeForm}
                className="rounded-lg p-1 transition-colors hover:bg-glass-highlight/40"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {deleteConfirm && editingHabit ? (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Delete <span className="text-foreground font-medium">&ldquo;{formName}&rdquo;</span>? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    size="default"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    size="default"
                    onClick={confirmDeleteHabit}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  placeholder="Habit name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                />

                <div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60 mb-1.5">Icon</div>
                  <div className="flex flex-wrap gap-1">
                    {ICON_OPTIONS.map((key) => {
                      const Ic = ICON_MAP[key]
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFormIcon(key)}
                          className={`flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg transition-all sm:h-8 sm:w-8 ${
                            formIcon === key ? "ring-1 ring-primary/40 bg-primary/10" : "hover:bg-glass-highlight/30"
                          }`}
                        >
                          <Ic className="h-3.5 w-3.5" style={{ color: formIcon === key ? formColor : undefined }} />
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60 mb-1.5">Color</div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormColor(c)}
                        className={`h-6 w-6 rounded-md transition-all ${
                          formColor === c ? "ring-2 ring-white/40 scale-110" : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <Button type="submit" variant="glass" className="w-full" size="default" disabled={!formName.trim()}>
                  {editingHabit ? "Save Changes" : "Create Habit"}
                </Button>

                {editingHabit && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    size="default"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete habit
                  </Button>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
