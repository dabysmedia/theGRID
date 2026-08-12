/**
 * Cardio = intentional conditioning sessions (cycling, running, stair stepper, …).
 *
 * Walking-type activity is deliberately NOT cardio here: it is already counted by
 * `StepEntry`, and folding it in would double-count a normal day of movement.
 * Strength/mobility work belongs to the workouts tracker instead.
 *
 * Google's `exerciseType` enum is an open set that gains new values over time, so
 * classification is an explicit allow-list: anything unrecognised is ignored rather
 * than guessed at.
 */

export const CARDIO_ACTIVITIES = [
  "cycling",
  "running",
  "stair_stepper",
  "elliptical",
  "rowing",
  "swimming",
  "hiit",
  "cardio",
] as const

export type CardioActivity = (typeof CARDIO_ACTIVITIES)[number]

const CARDIO_ACTIVITY_SET = new Set<string>(CARDIO_ACTIVITIES)

export const CARDIO_ACTIVITY_LABELS: Record<CardioActivity, string> = {
  cycling: "Cycling",
  running: "Running",
  stair_stepper: "Stair stepper",
  elliptical: "Elliptical",
  rowing: "Rowing",
  swimming: "Swimming",
  hiit: "HIIT",
  cardio: "Cardio",
}

/** Google Health `Exercise.ExerciseType` → normalized cardio activity. */
const GOOGLE_EXERCISE_TYPE_TO_ACTIVITY: Record<string, CardioActivity> = {
  ASSAULT_BIKE: "cycling",
  BIKING: "cycling",
  HAND_CYCLING: "cycling",
  MOUNTAIN_BIKE: "cycling",
  OUTDOOR_BIKE: "cycling",
  SPINNING: "cycling",
  STATIONARY_BIKE: "cycling",

  INCLINE_RUN: "running",
  RUNNING: "running",
  TRAIL_RUN: "running",
  TREADMILL: "running",

  STAIRCLIMBER: "stair_stepper",

  ELLIPTICAL: "elliptical",

  ROWING: "rowing",
  ROWING_MACHINE: "rowing",

  SWIMMING: "swimming",
  SWIMMING_OPEN_WATER: "swimming",
  SWIMMING_POOL: "swimming",

  HIIT: "hiit",
  INTERVAL_WORKOUT: "hiit",
  TABATA_WORKOUT: "hiit",

  AEROBIC_WORKOUT: "cardio",
  BOXING: "cardio",
  CARDIO_SCULPT: "cardio",
  CARDIO_WORKOUT: "cardio",
  JUMPING_ROPE: "cardio",
  KICKBOXING: "cardio",
  STEP_TRAINING: "cardio",
  WATER_JOGGING: "cardio",
}

/** Returns the cardio activity for a Google `exerciseType`, or null if it isn't cardio. */
export function cardioActivityForGoogleType(
  exerciseType: string | null | undefined,
): CardioActivity | null {
  if (!exerciseType) return null
  return GOOGLE_EXERCISE_TYPE_TO_ACTIVITY[exerciseType.toUpperCase()] ?? null
}

export function isCardioActivity(value: unknown): value is CardioActivity {
  return typeof value === "string" && CARDIO_ACTIVITY_SET.has(value)
}

export function cardioActivityLabel(activity: string): string {
  return isCardioActivity(activity) ? CARDIO_ACTIVITY_LABELS[activity] : "Cardio"
}

/**
 * Sessions shorter than this are treated as noise — watches routinely auto-detect
 * a couple of minutes of "biking" from a car ride or a walk to the parking lot.
 */
export const MIN_CARDIO_SESSION_MINUTES = 3

/** Parses a protobuf Duration string (`"1800s"`, `"3.5s"`) into minutes. */
export function durationStringToMinutes(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null
  // `Number("")` is 0, which would look like a real zero-length session and stop
  // the caller from falling back to the session's wall-clock duration.
  const raw = value.trim().replace(/s$/, "")
  if (raw === "") return null
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return seconds / 60
}
