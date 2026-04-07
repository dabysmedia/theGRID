"use client"

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from "react"
import { formatDate } from "@/lib/utils"

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
  const todayStr = formatDate(new Date())

  const [activeDate, setActiveDateRaw] = useState(() => {
    const stored = readStoredDate()
    return stored ?? todayStr
  })

  const isToday = activeDate === todayStr

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
    setActiveDateRaw(formatDate(new Date()))
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
