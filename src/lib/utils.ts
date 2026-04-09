import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, startOfDay, subDays } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function todayDate(): Date {
  return startOfDay(new Date())
}

export function formatDate(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

export function formatDisplayDate(date: Date): string {
  return format(date, "EEEE, MMMM d")
}

export function last7Days(): Date[] {
  const today = startOfDay(new Date())
  return Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i))
}

/**
 * Mean of daily values where the day has logged data (value greater than zero).
 * Aligns with weekly overview / dashboard: missing days are excluded from the denominator.
 */
export function averageOnLoggedDays(dailyTotals: number[]): number {
  const logged = dailyTotals.filter((v) => v > 0)
  if (!logged.length) return 0
  return logged.reduce((s, v) => s + v, 0) / logged.length
}

/** Parse "YYYY-MM-DD" as midnight local time (avoids UTC gotcha with new Date()) */
export function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00")
}
