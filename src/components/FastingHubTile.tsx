"use client"

import { useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { Timer } from "lucide-react"
import { DailySummaryCard } from "./DailySummaryCard"
import { useActiveDate } from "@/context/DateContext"
import { parseLocalDate } from "@/lib/utils"
import {
  aggregateFastHoursByDay,
  loadFastLogs,
  loadFastingConfig,
  type FastLogEntry,
  type FastingConfig,
} from "@/lib/fasting"

const COLOR = "#f97316"

export function FastingHubTile() {
  const { activeDate } = useActiveDate()
  const [logs, setLogs] = useState<FastLogEntry[]>([])
  const [config, setConfig] = useState<FastingConfig | null>(null)

  useEffect(() => {
    function refresh() {
      setLogs(loadFastLogs())
      setConfig(loadFastingConfig())
    }
    refresh()
    window.addEventListener("fasting-logs-changed", refresh)
    return () => window.removeEventListener("fasting-logs-changed", refresh)
  }, [])

  const { todayValue, last7, goal } = useMemo(() => {
    const end = parseLocalDate(activeDate)
    const keys = Array.from({ length: 7 }, (_, i) => format(subDays(end, 6 - i), "yyyy-MM-dd"))
    const byDay = aggregateFastHoursByDay(logs, keys)
    const last7 = keys.map((k) => Math.round((byDay[k] ?? 0) * 10) / 10)
    const todayKey = format(end, "yyyy-MM-dd")
    const todayValue = Math.round((byDay[todayKey] ?? 0) * 10) / 10
    return {
      todayValue,
      last7,
      goal: config?.fastHours ?? 16,
    }
  }, [activeDate, logs, config])

  return (
    <DailySummaryCard
      title="Fasting"
      value={todayValue}
      goal={goal}
      unit="hrs"
      icon={Timer}
      href="/fasting"
      chartData={last7.map((v) => ({ value: v }))}
      color={COLOR}
    />
  )
}
