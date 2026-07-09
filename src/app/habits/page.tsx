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
import { PageHeroStrip } from "@/components/PageHeroStrip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  cn,
  glassPanelAccentClass,
  glassPanelAccentStyle,
  glassPanelClass,
} from "@/lib/utils"
import { CATEGORY_THEME } from "@/lib/category-theme"
import { useActiveDate } from "@/context/DateContext"
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns"

const HABIT_THEME = CATEGORY_THEME.habits

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

  const bestStreak = useMemo(() => {
    let best = 0
    for (const h of habits) best = Math.max(best, getStreak(h.completions))
    return best
  }, [habits])

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
        }),
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
        setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))
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

  const doneCount = completedToday.size
  const totalCount = habits.length

  return (
    <div className="space-y-6">
      <PageHeader title="Habits" />

      <PageHeroStrip
        color={HABIT_THEME.color}
        icon={CheckSquare}
        eyebrow="Today"
        value={totalCount === 0 ? "—" : `${doneCount}`}
        unit={totalCount === 0 ? undefined : `/ ${totalCount}`}
        hint={totalCount === 0 ? "add a habit" : "complete"}
        metrics={[
          { label: "Habits", value: String(totalCount) },
          { label: "Best streak", value: bestStreak > 0 ? `${bestStreak}d` : "—" },
          {
            label: "Done today",
            value: totalCount === 0 ? "—" : `${Math.round((doneCount / Math.max(totalCount, 1)) * 100)}%`,
          },
        ]}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : habits.length === 0 ? (
        <div className={cn(glassPanelClass, "animate-fade-up p-8 text-center")}>
          <CheckSquare className="mx-auto mb-3 h-7 w-7 text-muted-foreground/30" />
          <p className="type-hud-caption mb-4 normal-case text-muted-foreground">
            No habits yet. Add your first one to start a streak.
          </p>
          <Button type="button" variant="glass" onClick={openCreate} className="mx-auto">
            <Plus className="mr-1.5 h-4 w-4" />
            New Habit
          </Button>
        </div>
      ) : (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3 px-0.5">
            <p className="type-hud-rail">Today&apos;s checklist</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openCreate}
              className="h-8 gap-1.5 rounded-xl px-2.5 text-primary hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="type-hud-chip">New</span>
            </Button>
          </div>

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
                className={cn(
                  glassPanelClass,
                  glassPanelAccentClass,
                  "animate-fade-up space-y-3 p-3.5 sm:p-4",
                )}
                style={{
                  ...glassPanelAccentStyle(habit.color),
                  animationDelay: `${idx * 40}ms`,
                }}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleHabit(habit.id)}
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-all duration-300 touch-manipulation active:scale-90",
                      done ? "border-transparent" : "hover:scale-105",
                    )}
                    style={{
                      backgroundColor: done ? habit.color : `${habit.color}15`,
                      borderColor: done ? "transparent" : `${habit.color}33`,
                    }}
                    aria-label={done ? `Uncheck ${habit.name}` : `Complete ${habit.name}`}
                  >
                    {done ? (
                      <Check className="h-5 w-5 text-white" strokeWidth={3} />
                    ) : (
                      <Icon className="h-4 w-4" style={{ color: habit.color }} strokeWidth={1.8} />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate font-heading text-sm font-semibold tracking-wide",
                        done && "text-muted-foreground/50 line-through",
                      )}
                    >
                      {habit.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {streak > 0 && (
                        <span className="inline-flex items-center gap-1 type-hud-caption normal-case">
                          <Flame className="h-3 w-3 text-orange-400" />
                          <span className="tabular-nums text-foreground/80">{streak}d</span>
                        </span>
                      )}
                      {best > 0 && (
                        <span className="inline-flex items-center gap-1 type-hud-caption normal-case text-muted-foreground/55">
                          <Trophy className="h-3 w-3" />
                          <span className="tabular-nums">{best}d best</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 type-hud-caption normal-case text-primary">
                        <TrendingUp className="h-3 w-3" />
                        <span className="tabular-nums font-semibold">{monthRate}%</span>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEdit(habit)}
                    className="shrink-0 rounded-xl p-2 opacity-40 transition-colors hover:bg-glass-highlight/40 hover:opacity-100 touch-manipulation"
                    title="Edit"
                    aria-label={`Edit ${habit.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
                    <div key={i} className="type-hud-micro pb-0.5 text-center text-muted-foreground/35">
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
                        className={cn(
                          "flex h-7 items-center justify-center rounded-md text-[10px] tabular-nums leading-none",
                          isFuture && "text-muted-foreground/15",
                          isActive && !isDone && "ring-1 ring-primary/40",
                          !isDone && !isFuture && "bg-glass-highlight/[0.06]",
                        )}
                        style={{
                          backgroundColor: isDone ? habit.color : undefined,
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
        </section>
      )}

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) closeForm()
        }}
      >
        <DialogContent className="mx-auto max-w-[400px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/30 px-4 py-3.5">
            <DialogTitle className="type-hud-label text-foreground">
              {editingHabit ? "Edit Habit" : "New Habit"}
            </DialogTitle>
          </DialogHeader>

          {deleteConfirm && editingHabit ? (
            <div className="space-y-4 p-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Delete <span className="font-medium text-foreground">&ldquo;{formName}&rdquo;</span>? This cannot be undone.
              </p>
              <DialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" className="flex-1" onClick={confirmDeleteHabit}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
              <Input
                placeholder="Habit name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />

              <div>
                <p className="type-hud-label-soft mb-2">Icon</p>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_OPTIONS.map((key) => {
                    const Ic = ICON_MAP[key]
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormIcon(key)}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl transition-all touch-manipulation sm:h-9 sm:w-9",
                          formIcon === key
                            ? "bg-primary/10 ring-1 ring-primary/40"
                            : "glass-subtle hover:bg-glass-highlight/30",
                        )}
                      >
                        <Ic className="h-3.5 w-3.5" style={{ color: formIcon === key ? formColor : undefined }} />
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p className="type-hud-label-soft mb-2">Color</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={cn(
                        "h-7 w-7 rounded-lg transition-all touch-manipulation",
                        formColor === c ? "scale-110 ring-2 ring-white/40" : "hover:scale-110",
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>

              <Button type="submit" variant="glass" className="w-full" disabled={!formName.trim()}>
                {editingHabit ? "Save Changes" : "Create Habit"}
              </Button>

              {editingHabit && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete habit
                </Button>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
