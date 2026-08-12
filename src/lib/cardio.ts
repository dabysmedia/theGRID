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

/**
 * Google Health `Exercise.ExerciseType` → normalized cardio activity.
 * Keys are checked against the v4 `Exercise.ExerciseType` enum reference.
 *
 * Types whose effort is mostly strength, mobility, or chores are absent on
 * purpose, as are the catch-all labels (`WORKOUT`, `SPORT`, `OTHER`): a watch
 * reports those for lifting sessions too, so counting them would inflate the
 * ring on days with no conditioning at all.
 */
const GOOGLE_EXERCISE_TYPE_TO_ACTIVITY: Record<string, CardioActivity> = {
  ASSAULT_BIKE: "cycling",
  BIKING: "cycling",
  ELECTRIC_BIKE: "cycling",
  HAND_CYCLING: "cycling",
  MOUNTAIN_BIKE: "cycling",
  OUTDOOR_BIKE: "cycling",
  SPINNING: "cycling",
  STATIONARY_BIKE: "cycling",
  UNICYCLING: "cycling",

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
  SYNCHRONIZED_SWIMMING: "swimming",

  HIIT: "hiit",
  INTERVAL_WORKOUT: "hiit",
  TABATA_WORKOUT: "hiit",

  AEROBIC_WORKOUT: "cardio",
  BOOTCAMP: "cardio",
  BOXING: "cardio",
  CARDIO_SCULPT: "cardio",
  CARDIO_WORKOUT: "cardio",
  CIRCUIT_TRAINING: "cardio",
  CROSSFIT: "cardio",
  CROSS_TRAINING: "cardio",
  EXERCISE_CLASS: "cardio",
  FITNESS_GAMING: "cardio",
  JUMPING_ROPE: "cardio",
  KICKBOXING: "cardio",
  MULTISPORT: "cardio",
  OUTDOOR_WORKOUT: "cardio",
  STEP_TRAINING: "cardio",
  TRAMPOLINE: "cardio",
  WATER_AEROBICS: "cardio",
  WATER_JOGGING: "cardio",

  BALLET: "cardio",
  BALLROOM_DANCE: "cardio",
  BREAKDANCING: "cardio",
  DANCING: "cardio",
  HIP_HOP: "cardio",
  JAZZ_DANCE: "cardio",
  MODERN_DANCE: "cardio",
  TANGO: "cardio",
  ZUMBA: "cardio",

  JIU_JITSU: "cardio",
  KARATE: "cardio",
  MARTIAL_ARTS: "cardio",
  MUAY_THAI: "cardio",
  TAEKWONDO: "cardio",
  WRESTLING: "cardio",

  BADMINTON: "cardio",
  BASKETBALL: "cardio",
  FIELD_HOCKEY: "cardio",
  FOOTBALL_AMERICAN: "cardio",
  FOOTBALL_AUSTRALIAN: "cardio",
  HANDBALL: "cardio",
  HOCKEY: "cardio",
  LACROSSE: "cardio",
  PADEL: "cardio",
  PICKELBALL: "cardio",
  RACKET_SPORTS: "cardio",
  RACQUETBALL: "cardio",
  RUGBY: "cardio",
  SOCCER: "cardio",
  SQUASH: "cardio",
  TENNIS: "cardio",
  TRACK_AND_FIELD: "cardio",
  ULTIMATE_FRISBEE: "cardio",
  VOLLEYBALL: "cardio",
  VOLLEYBALL_BEACH: "cardio",
  WATER_POLO: "cardio",

  CANOEING: "cardio",
  KAYAKING: "cardio",
  PADDLEBOARDING: "cardio",
  SURFING: "cardio",

  CROSS_COUNTRY_SKI: "cardio",
  ICE_SKATING: "cardio",
  ROLLERBLADING: "cardio",
  ROLLER_SKATING: "cardio",
  SKATING: "cardio",
  SKIING: "cardio",
  SNOWBOARDING: "cardio",
  SNOWSHOEING: "cardio",
  SPEED_SKATING: "cardio",

  CLIMBING: "cardio",
  GYMNASTICS: "cardio",
  INDOOR_CLIMBING: "cardio",
  PARKOUR: "cardio",
  ROCK_CLIMBING: "cardio",

  WHEELCHAIR: "cardio",
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
