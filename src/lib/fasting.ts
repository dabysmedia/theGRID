import { addDays, format, startOfDay } from "date-fns"

/* ─── Storage keys ───────────────────────────────────── */

export const FASTING_CONFIG_KEY = "theGRID_fasting_config"
export const FASTING_LOGS_KEY = "theGRID_fasting_logs"
/** @deprecated session-based timer — migrated away */
const LEGACY_STATE_KEY = "theGRID_fasting_state"

/* ─── Types ─────────────────────────────────────────── */

export interface FastingConfig {
  fastHours: number
  eatHours: number
  /** Minutes from local midnight (0–1439) when the eating window opens */
  eatWindowStartMinutes: number
  presetName: string
}

export interface FastLogEntry {
  id: string
  fastStartedAt: string
  fastEndedAt: string
  durationMinutes: number
  plannedFastHours: number
}

export type FastingPhase = "fasting" | "eating"

export interface ScheduleSnapshot {
  phase: FastingPhase
  phaseStart: Date
  phaseEnd: Date
  progress: number
  elapsedMs: number
  remainingMs: number
  /** Current eating window (the one active or next) for pills */
  eatingWindowStart: Date
  eatingWindowEnd: Date
}

export const DEFAULT_FASTING_CONFIG: FastingConfig = {
  fastHours: 16,
  eatHours: 8,
  eatWindowStartMinutes: 12 * 60,
  presetName: "16:8",
}

/* ─── Time helpers ──────────────────────────────────── */

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Minutes from midnight (0–1439) from a Date in local time */
export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** `HH:MM` string for `<input type="time" />` */
export function minutesToTimeInputValue(totalMinutes: number): string {
  const m = clamp(Math.round(totalMinutes), 0, 1439)
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

export function timeInputValueToMinutes(value: string): number {
  const [h, min] = value.split(":").map((x) => parseInt(x, 10))
  if (Number.isNaN(h) || Number.isNaN(min)) return 12 * 60
  return clamp(h * 60 + min, 0, 1439)
}

export function applyMinutesFromMidnight(day: Date, totalMinutes: number): Date {
  const d = startOfDay(day)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  d.setHours(h, m, 0, 0)
  return d
}

/* ─── Config load / save ─────────────────────────────── */

function migrateLegacyState(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(LEGACY_STATE_KEY)
  } catch {
    /* noop */
  }
}

export function loadFastingConfig(): FastingConfig {
  if (typeof window === "undefined") return DEFAULT_FASTING_CONFIG
  migrateLegacyState()
  try {
    const raw = localStorage.getItem(FASTING_CONFIG_KEY)
    if (!raw) return DEFAULT_FASTING_CONFIG
    const parsed = JSON.parse(raw) as Partial<FastingConfig>
    const eatWindowStartMinutes = clamp(
      Math.round(
        parsed.eatWindowStartMinutes ?? DEFAULT_FASTING_CONFIG.eatWindowStartMinutes
      ),
      0,
      1439
    )
    const fastHours = clamp(Math.round(parsed.fastHours ?? 16), 1, 23)
    let eatHours = clamp(Math.round(parsed.eatHours ?? 8), 1, 23)
    if (fastHours + eatHours !== 24) {
      eatHours = clamp(24 - fastHours, 1, 23)
    }
    return {
      fastHours,
      eatHours,
      eatWindowStartMinutes,
      presetName: typeof parsed.presetName === "string" ? parsed.presetName : "16:8",
    }
  } catch {
    return DEFAULT_FASTING_CONFIG
  }
}

export function saveFastingConfig(c: FastingConfig): void {
  const fastHours = clamp(Math.round(c.fastHours), 1, 23)
  let eatHours = clamp(Math.round(c.eatHours), 1, 23)
  if (fastHours + eatHours !== 24) {
    eatHours = clamp(24 - fastHours, 1, 23)
  }
  const normalized: FastingConfig = {
    ...c,
    eatWindowStartMinutes: clamp(Math.round(c.eatWindowStartMinutes), 0, 1439),
    fastHours,
    eatHours,
  }
  localStorage.setItem(FASTING_CONFIG_KEY, JSON.stringify(normalized))
}

/* ─── Schedule (local clock) ────────────────────────── */

/**
 * Intermittent fasting schedule: eating window length `eatHours`, starting at
 * `eatWindowStartMinutes` each local calendar day. Fasting fills the rest of the 24h cycle.
 */
export function getScheduleSnapshot(now: Date, config: FastingConfig): ScheduleSnapshot {
  const eatDurMs = config.eatHours * 3600_000
  const day0 = startOfDay(now)

  for (let offset = -3; offset <= 4; offset++) {
    const day = addDays(day0, offset)
    const eatStart = applyMinutesFromMidnight(day, config.eatWindowStartMinutes)
    const eatEnd = new Date(eatStart.getTime() + eatDurMs)
    if (now >= eatStart && now < eatEnd) {
      const elapsed = now.getTime() - eatStart.getTime()
      return {
        phase: "eating",
        phaseStart: eatStart,
        phaseEnd: eatEnd,
        progress: Math.min(1, elapsed / eatDurMs),
        elapsedMs: elapsed,
        remainingMs: eatEnd.getTime() - now.getTime(),
        eatingWindowStart: eatStart,
        eatingWindowEnd: eatEnd,
      }
    }
  }

  for (let offset = -3; offset <= 4; offset++) {
    const day = addDays(day0, offset)
    const eatStart = applyMinutesFromMidnight(day, config.eatWindowStartMinutes)
    const eatEnd = new Date(eatStart.getTime() + eatDurMs)
    const nextEatStart = applyMinutesFromMidnight(addDays(day, 1), config.eatWindowStartMinutes)
    if (now >= eatEnd && now < nextEatStart) {
      const fastDurMs = nextEatStart.getTime() - eatEnd.getTime()
      const elapsed = now.getTime() - eatEnd.getTime()
      return {
        phase: "fasting",
        phaseStart: eatEnd,
        phaseEnd: nextEatStart,
        progress: Math.min(1, elapsed / fastDurMs),
        elapsedMs: elapsed,
        remainingMs: nextEatStart.getTime() - now.getTime(),
        eatingWindowStart: nextEatStart,
        eatingWindowEnd: new Date(nextEatStart.getTime() + eatDurMs),
      }
    }
  }

  // Fallback (should not happen): treat as fasting ending soon
  const fallbackEat = applyMinutesFromMidnight(day0, config.eatWindowStartMinutes)
  const fallbackEnd = new Date(fallbackEat.getTime() + eatDurMs)
  return {
    phase: "fasting",
    phaseStart: now,
    phaseEnd: fallbackEat,
    progress: 0,
    elapsedMs: 0,
    remainingMs: Math.max(0, fallbackEat.getTime() - now.getTime()),
    eatingWindowStart: fallbackEat,
    eatingWindowEnd: fallbackEnd,
  }
}

/* ─── Fast logs (client history) ────────────────────── */

export function loadFastLogs(): FastLogEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(FASTING_LOGS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as FastLogEntry[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveFastLogs(logs: FastLogEntry[]): void {
  localStorage.setItem(FASTING_LOGS_KEY, JSON.stringify(logs))
}

export function appendFastLog(entry: Omit<FastLogEntry, "id">): FastLogEntry {
  const logs = loadFastLogs()
  const id = crypto.randomUUID()
  const full: FastLogEntry = { ...entry, id }
  const last = logs[logs.length - 1]
  if (
    last &&
    Math.abs(new Date(last.fastEndedAt).getTime() - new Date(entry.fastEndedAt).getTime()) <
      90_000
  ) {
    return last
  }
  logs.push(full)
  const max = 400
  const trimmed = logs.length > max ? logs.slice(-max) : logs
  saveFastLogs(trimmed)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fasting-logs-changed"))
  }
  return full
}

/** Group completed fast duration by local calendar day of `fastEndedAt` */
export function aggregateFastHoursByDay(
  logs: FastLogEntry[],
  dayKeys: string[]
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const k of dayKeys) map[k] = 0
  for (const log of logs) {
    const key = format(new Date(log.fastEndedAt), "yyyy-MM-dd")
    if (key in map) map[key] += log.durationMinutes / 60
  }
  return map
}

export function formatShortTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
