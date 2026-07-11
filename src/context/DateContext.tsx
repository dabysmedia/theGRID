"use client"

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react"
import { formatDate } from "@/lib/utils"
import { stepsDayKey } from "@/lib/steps-day"

const STORAGE_KEY = "theGRID_activeDate"

interface DateContextValue {
  activeDate: string
  setActiveDate: (date: string) => void
  isToday: boolean
  goToday: () => void
  goPrev: () => void
  goNext: () => void
}

const DateContext = createContext<DateContextValue | null>(null)

function readStoredDate(): string | null {
  if (typeof window === "undefined") return null
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  } catch {}
  return null
}

export function DateProvider({ children }: { children: ReactNode }) {
  // Use a server/client-stable calendar key for hydration, then switch to the
  // browser's local 5am tracking day immediately after mount.
  const [todayStr, setTodayStr] = useState(() => formatDate(new Date()))
  const todayRef = useRef(todayStr)

  const [activeDate, setActiveDateRaw] = useState(() => {
    const stored = readStoredDate()
    return stored ?? todayStr
  })

  const isToday = activeDate === todayStr

  useEffect(() => {
    const refreshTrackingDay = () => {
      const nextToday = stepsDayKey()
      const previousToday = todayRef.current
      if (nextToday === previousToday) return
      todayRef.current = nextToday
      setTodayStr(nextToday)
      setActiveDateRaw((current) => (current === previousToday ? nextToday : current))
    }

    const initialRefresh = window.setTimeout(refreshTrackingDay, 0)
    const interval = window.setInterval(refreshTrackingDay, 30_000)
    window.addEventListener("focus", refreshTrackingDay)
    document.addEventListener("visibilitychange", refreshTrackingDay)
    return () => {
      window.clearTimeout(initialRefresh)
      window.clearInterval(interval)
      window.removeEventListener("focus", refreshTrackingDay)
      document.removeEventListener("visibilitychange", refreshTrackingDay)
    }
  }, [])

  useEffect(() => {
    try {
      if (activeDate === todayStr) {
        sessionStorage.removeItem(STORAGE_KEY)
      } else {
        sessionStorage.setItem(STORAGE_KEY, activeDate)
      }
    } catch {}
  }, [activeDate, todayStr])

  const setActiveDate = useCallback((date: string) => {
    setActiveDateRaw(date)
  }, [])

  const goToday = useCallback(() => {
    setActiveDateRaw(stepsDayKey())
  }, [])

  const goPrev = useCallback(() => {
    setActiveDateRaw((prev) => {
      const d = new Date(prev + "T12:00:00")
      d.setDate(d.getDate() - 1)
      return formatDate(d)
    })
  }, [])

  const goNext = useCallback(() => {
    setActiveDateRaw((prev) => {
      const d = new Date(prev + "T12:00:00")
      d.setDate(d.getDate() + 1)
      return formatDate(d)
    })
  }, [])

  const value = useMemo<DateContextValue>(
    () => ({ activeDate, setActiveDate, isToday, goToday, goPrev, goNext }),
    [activeDate, setActiveDate, isToday, goToday, goPrev, goNext]
  )

  return <DateContext value={value}>{children}</DateContext>
}

export function useActiveDate(): DateContextValue {
  const ctx = useContext(DateContext)
  if (!ctx) throw new Error("useActiveDate must be used within DateProvider")
  return ctx
}
