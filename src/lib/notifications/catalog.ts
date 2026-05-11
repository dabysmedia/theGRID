/**
 * Authoritative catalog of every push notification the app can send.
 *
 * Add a new notification by appending an entry here, wiring an evaluator in
 * `src/lib/notifications/server/evaluators.ts`, and (optionally) surfacing
 * a toggle in `<PushNotificationManager />`.
 *
 * "schedule" notifications fire at a user-chosen local time of day.
 * "event" notifications fire when their server-side condition first becomes
 * true on a given local day (e.g. fasting window completed).
 */

export type NotificationKey =
  | "log_breakfast"
  | "log_lunch"
  | "log_dinner"
  | "log_weight"
  | "log_sleep"
  | "bedtime"
  | "journal"
  | "steps_check_in"
  | "recovery_check_in"
  | "habits_remaining"
  | "weekly_summary"
  | "fasting_window_complete"
  | "eating_window_closing"
  | "workout_streak_at_risk"

export type NotificationCategory =
  | "meals"
  | "fitness"
  | "sleep"
  | "fasting"
  | "habits"
  | "summary"
  | "recovery"

export interface NotificationDef {
  key: NotificationKey
  title: string
  /** One-line description shown in settings */
  description: string
  category: NotificationCategory
  /** "schedule" fires at `timeOfDay`; "event" fires when the server-side condition flips true. */
  kind: "schedule" | "event"
  /** Default HH:mm local time for schedule kind */
  defaultTime?: string
  /** Whether the toggle is on by default when a user subscribes */
  defaultEnabled: boolean
  /** Whether the user can customise the time of day in the UI */
  timeEditable: boolean
  /** Lucide icon name for the settings row (matches keys in `iconFor` below) */
  icon: NotificationIconName
}

export type NotificationIconName =
  | "utensils"
  | "scale"
  | "bed"
  | "moon"
  | "pen"
  | "footprints"
  | "activity"
  | "checkSquare"
  | "barChart"
  | "timer"
  | "flame"
  | "dumbbell"

export const NOTIFICATION_CATALOG: NotificationDef[] = [
  {
    key: "log_breakfast",
    title: "Log breakfast",
    description: "Nudge to log breakfast if you haven't yet.",
    category: "meals",
    kind: "schedule",
    defaultTime: "09:00",
    defaultEnabled: true,
    timeEditable: true,
    icon: "utensils",
  },
  {
    key: "log_lunch",
    title: "Log lunch",
    description: "Nudge to log lunch if you haven't yet.",
    category: "meals",
    kind: "schedule",
    defaultTime: "12:30",
    defaultEnabled: true,
    timeEditable: true,
    icon: "utensils",
  },
  {
    key: "log_dinner",
    title: "Log dinner",
    description: "Nudge to log dinner if you haven't yet.",
    category: "meals",
    kind: "schedule",
    defaultTime: "19:00",
    defaultEnabled: true,
    timeEditable: true,
    icon: "utensils",
  },
  {
    key: "log_weight",
    title: "Morning weigh-in",
    description: "Reminder to log today's weight (only if you haven't).",
    category: "fitness",
    kind: "schedule",
    defaultTime: "08:00",
    defaultEnabled: true,
    timeEditable: true,
    icon: "scale",
  },
  {
    key: "log_sleep",
    title: "Log last night's sleep",
    description: "Morning prompt to record bedtime, wake time, and quality.",
    category: "sleep",
    kind: "schedule",
    defaultTime: "09:30",
    defaultEnabled: false,
    timeEditable: true,
    icon: "bed",
  },
  {
    key: "bedtime",
    title: "Bedtime",
    description: "Wind-down ping at your chosen bedtime each night.",
    category: "sleep",
    kind: "schedule",
    defaultTime: "22:30",
    defaultEnabled: false,
    timeEditable: true,
    icon: "moon",
  },
  {
    key: "journal",
    title: "Daily journal",
    description: "Evening reminder to write today's journal entry.",
    category: "habits",
    kind: "schedule",
    defaultTime: "21:00",
    defaultEnabled: false,
    timeEditable: true,
    icon: "pen",
  },
  {
    key: "steps_check_in",
    title: "Step goal check-in",
    description: "Mid-afternoon ping if you're tracking below your step goal.",
    category: "fitness",
    kind: "schedule",
    defaultTime: "15:00",
    defaultEnabled: false,
    timeEditable: true,
    icon: "footprints",
  },
  {
    key: "recovery_check_in",
    title: "Recovery check-in",
    description: "Daily prompt to fill the recovery questionnaire.",
    category: "recovery",
    kind: "schedule",
    defaultTime: "09:15",
    defaultEnabled: false,
    timeEditable: true,
    icon: "activity",
  },
  {
    key: "habits_remaining",
    title: "Habits left for today",
    description: "Evening nudge if any active habits aren't completed.",
    category: "habits",
    kind: "schedule",
    defaultTime: "20:00",
    defaultEnabled: false,
    timeEditable: true,
    icon: "checkSquare",
  },
  {
    key: "weekly_summary",
    title: "Weekly summary",
    description: "Sunday-evening recap of the week's stats.",
    category: "summary",
    kind: "schedule",
    defaultTime: "20:00",
    defaultEnabled: false,
    timeEditable: true,
    icon: "barChart",
  },
  {
    key: "fasting_window_complete",
    title: "Fasting window complete",
    description: "Fires the moment your fast ends and the eating window opens.",
    category: "fasting",
    kind: "event",
    defaultEnabled: true,
    timeEditable: false,
    icon: "timer",
  },
  {
    key: "eating_window_closing",
    title: "Eating window closing soon",
    description: "30 minutes before your eating window ends.",
    category: "fasting",
    kind: "event",
    defaultEnabled: false,
    timeEditable: false,
    icon: "flame",
  },
  {
    key: "workout_streak_at_risk",
    title: "Workout streak at risk",
    description: "Evening ping if you haven't logged a workout in two days.",
    category: "fitness",
    kind: "event",
    defaultEnabled: false,
    timeEditable: false,
    icon: "dumbbell",
  },
]

export const NOTIFICATION_BY_KEY: Record<NotificationKey, NotificationDef> =
  NOTIFICATION_CATALOG.reduce((acc, def) => {
    acc[def.key] = def
    return acc
  }, {} as Record<NotificationKey, NotificationDef>)

export const NOTIFICATION_KEYS = NOTIFICATION_CATALOG.map((d) => d.key)

export function isNotificationKey(value: unknown): value is NotificationKey {
  return typeof value === "string" && value in NOTIFICATION_BY_KEY
}

export const NOTIFICATION_CATEGORIES: {
  key: NotificationCategory
  label: string
}[] = [
  { key: "meals", label: "Meals" },
  { key: "fasting", label: "Fasting" },
  { key: "fitness", label: "Fitness" },
  { key: "sleep", label: "Sleep" },
  { key: "habits", label: "Habits & journal" },
  { key: "recovery", label: "Recovery" },
  { key: "summary", label: "Summary" },
]

/** Parses a "HH:mm" string into total minutes from local midnight, or null if invalid. */
export function parseTimeOfDay(value: string | null | undefined): number | null {
  if (!value) return null
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}
