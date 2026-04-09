import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, startOfDay, subDays } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Primary “glass” CTA — frosted panel + ladder yellow accent (matches glass UI) */
export const glassCtaButtonClass =
  "relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-b from-primary/15 via-primary/6 to-transparent text-primary backdrop-blur-md shadow-[inset_0_1px_0_0_oklch(1_0_0/12%)] transition-all hover:border-primary/45 hover:from-primary/22 hover:text-primary dark:border-primary/25 dark:from-primary/10 dark:hover:from-primary/18"

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
