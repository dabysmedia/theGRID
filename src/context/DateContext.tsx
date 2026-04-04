"use client"

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { formatDate } from "@/lib/utils"

interface DateContextValue {
  activeDate: string
  setActiveDate: (date: string) => void
  isToday: boolean
  goToday: () => void
  goPrev: () => void
  goNext: () => void
}

const DateContext = createContext<DateContextValue | null>(null)

export function DateProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const todayStr = formatDate(new Date())
  const paramDate = searchParams.get("d")
  const activeDate = paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate) ? paramDate : todayStr
  const isToday = activeDate === todayStr

  const navigate = useCallback(
    (date: string) => {
      const today = formatDate(new Date())
      const params = new URLSearchParams(searchParams.toString())
      if (date === today) {
        params.delete("d")
      } else {
        params.set("d", date)
      }
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [router, pathname, searchParams]
  )

  const setActiveDate = useCallback(
    (date: string) => navigate(date),
    [navigate]
  )

  const goToday = useCallback(
    () => navigate(formatDate(new Date())),
    [navigate]
  )

  const goPrev = useCallback(() => {
    const d = new Date(activeDate + "T12:00:00")
    d.setDate(d.getDate() - 1)
    navigate(formatDate(d))
  }, [activeDate, navigate])

  const goNext = useCallback(() => {
    const d = new Date(activeDate + "T12:00:00")
    d.setDate(d.getDate() + 1)
    const tomorrow = formatDate(d)
    const today = formatDate(new Date())
    if (tomorrow > today) return
    navigate(tomorrow)
  }, [activeDate, navigate])

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
