"use client"

import { useEffect, useMemo, useState } from "react"
import { Beer, Calendar, Trash2 } from "lucide-react"
import { format } from "date-fns"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import { PageHeader } from "@/components/PageHeader"
import { useActiveDate } from "@/context/DateContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDate, last7Days, parseLocalDate } from "@/lib/utils"
import { CategoryGoal, type GoalPreset } from "@/components/CategoryGoal"

const alcoholGoalPresets: GoalPreset[] = [
  { type: "daily", label: "Daily Max", unit: "units", placeholder: "2", direction: "down" },
  { type: "weekly", label: "Weekly Max", unit: "units", placeholder: "10", direction: "down" },
]

interface AlcoholEntry {
  id: string
  date: string
  drinkType: string
  quantity: number
  units: number
}

const drinkTypes = ["beer", "wine", "spirits", "cocktail", "other"]

const AMBER = "#f59e0b"

function entryDateKey(dateStr: string): string {
  return dateStr.slice(0, 10)
}

export default function AlcoholPage() {
  const { activeDate } = useActiveDate()
  const [entries, setEntries] = useState<AlcoholEntry[]>([])
  const [drinkType, setDrinkType] = useState("beer")
  const [quantity, setQuantity] = useState("1")
  const [units, setUnits] = useState("1")

  const today = activeDate
  const sevenDays = useMemo(() => last7Days(), [])
  const weekDateKeys = useMemo(
    () => sevenDays.map((d) => formatDate(d)),
    [sevenDays]
  )

  useEffect(() => {
    fetch("/api/alcohol")
      .then(async (r) => {
        const data = await r.json()
        setEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => setEntries([]))
  }, [])

  const unitsByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const key of weekDateKeys) map.set(key, 0)
    for (const e of entries) {
      const k = entryDateKey(e.date)
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + e.units)
    }
    return map
  }, [entries, weekDateKeys])

  const weekTotal = useMemo(() => {
    let s = 0
    for (const k of weekDateKeys) s += unitsByDay.get(k) ?? 0
    return s
  }, [unitsByDay, weekDateKeys])

  const todayUnits = unitsByDay.get(today) ?? 0
  const avgPerDay = weekTotal / 7
  const dryDays = useMemo(() => {
    let n = 0
    for (const k of weekDateKeys) {
      if ((unitsByDay.get(k) ?? 0) === 0) n += 1
    }
    return n
  }, [unitsByDay, weekDateKeys])

  const chartData = useMemo(
    () =>
      sevenDays.map((d) => {
        const key = formatDate(d)
        return {
          label: format(d, "EEE"),
          dateKey: key,
          units: unitsByDay.get(key) ?? 0,
        }
      }),
    [sevenDays, unitsByDay]
  )

  const entriesByDate = useMemo(() => {
    const groups = new Map<string, AlcoholEntry[]>()
    for (const e of entries) {
      const k = entryDateKey(e.date)
      const list = groups.get(k)
      if (list) list.push(e)
      else groups.set(k, [e])
    }
    const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a))
    return sortedKeys.map((dateKey) => ({
      dateKey,
      items: groups.get(dateKey)!,
    }))
  }, [entries])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!quantity || !units) return

    const res = await fetch("/api/alcohol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, drinkType, quantity, units }),
    })

    if (res.ok) {
      const entry = await res.json()
      setEntries([entry, ...entries])
      setQuantity("1")
      setUnits("1")
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/alcohol?id=${id}`, { method: "DELETE" })
    if (res.ok) setEntries(entries.filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Alcohol" icon={Beer} iconColor={AMBER} />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none animate-fade-up">
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-[7.5rem] shrink-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Today
          </p>
          <p className="text-lg lg:text-xl font-bold tabular-nums">{todayUnits}</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-[7.5rem] shrink-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Week Total
          </p>
          <p className="text-lg lg:text-xl font-bold tabular-nums">{weekTotal}</p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-[7.5rem] shrink-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Avg/Day
          </p>
          <p className="text-lg lg:text-xl font-bold tabular-nums">
            {avgPerDay.toFixed(1)}
          </p>
        </div>
        <div className="glass-subtle rounded-xl p-3 lg:p-4 flex-1 min-w-[7.5rem] shrink-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1 truncate">
            Dry Days
          </p>
          <p className="text-lg lg:text-xl font-bold tabular-nums">{dryDays}</p>
        </div>
      </div>

      <CategoryGoal
        category="alcohol"
        values={{ daily: todayUnits, weekly: weekTotal }}
        presets={alcoholGoalPresets}
        color="#f59e0b"
      />

      <div className="glass rounded-2xl p-4 lg:p-5 animate-fade-up stagger-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Last 7 days
        </p>
        <div className="h-40 lg:h-48 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/25" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
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
                contentStyle={{
                  background: "oklch(0.19 0.012 250 / 92%)",
                  border: "1px solid oklch(1 0 0 / 8%)",
                  borderRadius: "3px",
                  fontSize: "12px",
                  backdropFilter: "blur(8px)",
                }}
                formatter={(value) => [`${Number(value ?? 0)} units`, "Units"]}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { dateKey?: string } | undefined
                  return p?.dateKey ? format(parseLocalDate(p.dateKey), "EEE, MMM d") : ""
                }}
              />
              <Bar dataKey="units" fill={AMBER} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up stagger-2">
        <div className="glass rounded-2xl p-5">
          <div className="text-center lg:text-left mb-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Today&apos;s Units</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight">{todayUnits}</p>
            <p className="text-sm text-muted-foreground">standard units</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {drinkTypes.map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant={drinkType === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDrinkType(d)}
                  className="capitalize"
                >
                  {d}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quantity" className="text-xs uppercase tracking-wider text-muted-foreground">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.5"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="units" className="text-xs uppercase tracking-wider text-muted-foreground">Std Units</Label>
                <Input
                  id="units"
                  type="number"
                  step="0.5"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full press-scale" size="lg">
              Log Drink
            </Button>
          </form>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground px-1">History</h2>
          {entries.length === 0 && (
            <div className="glass-subtle rounded-2xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No entries yet</p>
            </div>
          )}
          {entriesByDate.map(({ dateKey, items }) => (
            <div key={dateKey} className="space-y-2">
              <div className="flex items-center gap-2 px-1 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs font-medium uppercase tracking-wider">
                  {format(parseLocalDate(dateKey), "EEEE, MMM d, yyyy")}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((entry) => (
                  <div key={entry.id} className="glass-subtle rounded-xl p-3.5 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f59e0b]/10">
                        <Beer className="h-3.5 w-3.5 text-[#f59e0b]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold capitalize">{entry.drinkType}</span>
                          <span className="text-muted-foreground">{entry.quantity}x</span>
                          <span className="text-xs text-muted-foreground">{entry.units} units</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
