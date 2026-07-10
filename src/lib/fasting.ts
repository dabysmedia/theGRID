import { addDays, format, startOfDay } from "date-fns"

/* ─── Storage keys ───────────────────────────────────── */

export const FASTING_CONFIG_KEY = "theGRID_fasting_config"
export const FASTING_LOGS_KEY = "theGRID_fasting_logs"
/** Wall-clock ms when the dashboard timer was paused; null = live */
export const FASTING_TIMER_PAUSE_KEY = "theGRID_fasting_timer_paused_at_ms"
/** When "true", the home fasting widget is inactive (no live countdown) until re-enabled */
export const FASTING_TIMER_DISABLED_KEY = "theGRID_fasting_timer_disabled"
/** Wall-clock ms when the user last ate — anchors fast/eat cycles to that moment */
export const FASTING_LAST_MEAL_AT_KEY = "theGRID_fasting_last_meal_at_ms"
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

export function loadFastingTimerPausedAtMs(): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(FASTING_TIMER_PAUSE_KEY)
    if (raw == null || raw === "") return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  } catch {
    return null
  }
}

export function saveFastingTimerPausedAtMs(ms: number | null): void {
  if (typeof window === "undefined") return
  try {
    if (ms == null) localStorage.removeItem(FASTING_TIMER_PAUSE_KEY)
    else localStorage.setItem(FASTING_TIMER_PAUSE_KEY, String(ms))
  } catch {
    /* noop */
  }
}

export function loadFastingTimerDisabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(FASTING_TIMER_DISABLED_KEY) === "1"
  } catch {
    return false
  }
}

export const FASTING_TIMER_CHANGED_EVENT = "fasting-timer-changed"

export function notifyFastingTimerChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(FASTING_TIMER_CHANGED_EVENT))
}

export function saveFastingTimerDisabled(disabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (disabled) localStorage.setItem(FASTING_TIMER_DISABLED_KEY, "1")
    else localStorage.removeItem(FASTING_TIMER_DISABLED_KEY)
    notifyFastingTimerChanged()
  } catch {
    /* noop */
  }
}

export function loadFastingLastMealAtMs(): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(FASTING_LAST_MEAL_AT_KEY)
    if (raw == null || raw === "") return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  } catch {
    return null
  }
}

export function saveFastingLastMealAtMs(ms: number | null): void {
  if (typeof window === "undefined") return
  try {
    if (ms == null) localStorage.removeItem(FASTING_LAST_MEAL_AT_KEY)
    else localStorage.setItem(FASTING_LAST_MEAL_AT_KEY, String(ms))
  } catch {
    /* noop */
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

const DAY_MS = 24 * 3600_000

/**
 * Fast/eat cycle anchored to `lastMealAt` (fast begins when the meal ends).
 * Uses `fastHours` and `eatHours` from config (must sum to 24). Ignores wall-clock eat start.
 */
export function getAnchoredScheduleSnapshot(
  now: Date,
  lastMealAt: Date,
  config: FastingConfig
): ScheduleSnapshot {
  const fastDurMs = config.fastHours * 3600_000
  const eatDurMs = config.eatHours * 3600_000
  const L = lastMealAt.getTime()
  const n = now.getTime()
  let t = n - L
  if (t < 0) t = 0
  const cycleIndex = Math.floor(t / DAY_MS)
  const r = t - cycleIndex * DAY_MS
  const cycleBase = L + cycleIndex * DAY_MS

  if (r < fastDurMs) {
    const phaseStart = new Date(cycleBase)
    const phaseEnd = new Date(cycleBase + fastDurMs)
    const elapsed = n - phaseStart.getTime()
    const nextEatStart = phaseEnd
    return {
      phase: "fasting",
      phaseStart,
      phaseEnd,
      progress: Math.min(1, elapsed / fastDurMs),
      elapsedMs: elapsed,
      remainingMs: Math.max(0, phaseEnd.getTime() - n),
      eatingWindowStart: nextEatStart,
      eatingWindowEnd: new Date(nextEatStart.getTime() + eatDurMs),
    }
  }

  const phaseStart = new Date(cycleBase + fastDurMs)
  const phaseEnd = new Date(cycleBase + fastDurMs + eatDurMs)
  const elapsed = n - phaseStart.getTime()
  return {
    phase: "eating",
    phaseStart,
    phaseEnd,
    progress: Math.min(1, elapsed / eatDurMs),
    elapsedMs: elapsed,
    remainingMs: Math.max(0, phaseEnd.getTime() - n),
    eatingWindowStart: phaseStart,
    eatingWindowEnd: phaseEnd,
  }
}

/**
 * Interpret `<input type="time" />` as the most recent local moment at that clock time:
 * today at `value`, or yesterday if that would still be in the future.
 */
export function parseTimeInputToLastMealDate(value: string, now: Date): Date | null {
  const v = value.trim()
  if (!v || !/^\d{1,2}:\d{2}$/.test(v)) return null
  const [hs, ms] = v.split(":")
  const h = parseInt(hs, 10)
  const min = parseInt(ms, 10)
  if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null
  }
  const totalMinutes = h * 60 + min
  const dayStart = startOfDay(now)
  let candidate = applyMinutesFromMidnight(dayStart, totalMinutes)
  if (candidate.getTime() > now.getTime()) {
    candidate = applyMinutesFromMidnight(addDays(dayStart, -1), totalMinutes)
  }
  return candidate
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

/**
 * While in the eating phase, the completed fast ended at `eatingWindowStart`.
 * Call periodically (or on mount) so we still record the fast if the app missed
 * the fasting→eating transition (tab closed, background throttling, or first load in eat window).
 */
export function ensureFastLogForEatingPhase(
  snapshot: ScheduleSnapshot,
  config: FastingConfig
): void {
  if (snapshot.phase !== "eating") return
  const eatStart = snapshot.eatingWindowStart
  const fastEndedMs = eatStart.getTime()
  const fastStartMs = fastEndedMs - config.fastHours * 3600_000
  const fastStartedAt = new Date(fastStartMs).toISOString()
  const fastEndedAt = eatStart.toISOString()
  const durationMinutes = (fastEndedMs - fastStartMs) / 60000

  const toleranceMs = 120_000
  const logs = loadFastLogs()
  const already = logs.some(
    (l) => Math.abs(new Date(l.fastEndedAt).getTime() - fastEndedMs) < toleranceMs
  )
  if (already) return

  appendFastLog({
    fastStartedAt,
    fastEndedAt,
    durationMinutes,
    plannedFastHours: config.fastHours,
  })
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

/* ─── Server sync (for push notifications) ──────────────────────────────
 * Mirror the current fasting state to the server so the notification cron
 * can fire "fasting window complete" / "eating window closing" pushes even
 * when the app is closed. Best-effort — failures are silently ignored. */

/**
 * Push current fasting config + last-meal anchor to the server.
 * Reads from localStorage so the caller doesn't have to plumb state through.
 * Pass `userId` so the request is attributed to the active profile.
 */
export async function syncFastingProfileToServer(userId: string | null | undefined): Promise<void> {
  if (typeof window === "undefined") return
  if (!userId) return
  try {
    const config = loadFastingConfig()
    const lastMealAtMs = loadFastingLastMealAtMs()
    await fetch("/api/notifications/fasting-profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify({
        fastHours: config.fastHours,
        eatHours: config.eatHours,
        eatWindowStartMinutes: config.eatWindowStartMinutes,
        lastMealAtMs,
        mode: lastMealAtMs ? "anchored" : "clock",
      }),
      keepalive: true,
    })
  } catch {
    /* noop — push notifications are non-essential */
  }
}
