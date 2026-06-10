import legacyExercises from "../../../test_exercises.json"

export interface ApiMuscle {
  id: string
  code: string
  color: string
  name: string
}

export interface ApiCategory {
  id: string
  code: string
  name: string
}

export interface ApiType {
  id: string
  code: string
  name: string
}

export interface ApiExercise {
  id: string
  code: string
  name: string
  description?: string
  primaryMuscles: ApiMuscle[]
  secondaryMuscles: ApiMuscle[]
  types: ApiType[]
  categories: ApiCategory[]
}

interface LegacyExercise {
  id: string
  name: string
  equipment: string | null
  category: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
}

export const MUSCLE_COLORS: Record<string, string> = {
  Chest: "#D62828",
  Back: "#1D4ED8",
  Lats: "#2563EB",
  "Upper Back": "#1E40AF",
  Rhomboids: "#1E3A8A",
  "Lower Back": "#312E81",
  Shoulders: "#F77F00",
  Legs: "#577590",
  Quadriceps: "#577590",
  Hamstrings: "#90BE6D",
  Glutes: "#6D597A",
  Calves: "#4CC9F0",
  Arms: "#FFBE0B",
  Biceps: "#FFBE0B",
  Triceps: "#2DC653",
  Forearms: "#219EBC",
  Core: "#E76F51",
  Abdominals: "#E76F51",
  Obliques: "#00B4D8",
  Trapezius: "#264653",
  Adductors: "#7B6B8D",
  Abductors: "#8B7AA8",
  Cardio: "#4CC9F0",
}

const EQUIPMENT_CATEGORY: Record<string, string> = {
  machine: "Machine",
  cable: "Cable",
  "body only": "Body weight",
  barbell: "Free weight",
  dumbbell: "Free weight",
  kettlebells: "Free weight",
  bands: "Free weight",
  "e-z curl bar": "Free weight",
  "medicine ball": "Free weight",
  other: "Free weight",
}

const LEGACY_MUSCLE_MAP: Record<string, string> = {
  abdominals: "Abdominals",
  lats: "Lats",
  "middle back": "Upper Back",
  "lower back": "Lower Back",
  traps: "Trapezius",
  chest: "Chest",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quadriceps: "Quadriceps",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  adductors: "Adductors",
  abductors: "Abductors",
  neck: "Trapezius",
}

/** Remap coarse API "Back" exercises to subdivided back muscles (keys are normalized names). */
const API_BACK_MUSCLE_BY_NAME: Record<string, string> = {
  "australian pull ups": "Lats",
  "back extensions": "Lower Back",
  "barbell bent over row": "Upper Back",
  "bent over dumbbell row": "Upper Back",
  deadlift: "Lower Back",
  "horizontal row machine": "Upper Back",
  "low cable row": "Upper Back",
  "pronated grip pull ups": "Lats",
  "pull down": "Lats",
  pullover: "Lats",
  "pushdown straight arm": "Lats",
  "t bar row": "Upper Back",
  "trx row": "Upper Back",
  "unilateral bent over row": "Upper Back",
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function muscleTag(name: string) {
  const label = name.trim()
  return {
    id: label.toLowerCase().replace(/\s+/g, "-"),
    code: label.toUpperCase().replace(/\s+/g, "_"),
    color: MUSCLE_COLORS[label] ?? "#888888",
    name: label,
  }
}

function categoryTag(name: string) {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    code: name.toUpperCase().replace(/\s+/g, "_"),
    name,
  }
}

function mapLegacyMuscle(raw: string): string | null {
  const mapped = LEGACY_MUSCLE_MAP[raw.trim().toLowerCase()]
  return mapped ?? null
}

function legacyEquipmentCategory(equipment: string | null): string {
  if (!equipment) return "Free weight"
  return EQUIPMENT_CATEGORY[equipment.toLowerCase()] ?? "Free weight"
}

function makeExercise(
  name: string,
  primaryMuscle: string,
  category = "Free weight",
  secondaryMuscles: string[] = [],
  codeSuffix = "",
): ApiExercise {
  const slug = normalizeName(name).replace(/\s+/g, "-")
  const codeBase = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")
  return {
    id: `local-${slug}${codeSuffix}`,
    code: `${codeBase}${codeSuffix}`,
    name,
    primaryMuscles: [muscleTag(primaryMuscle)],
    secondaryMuscles: secondaryMuscles.map(muscleTag),
    types: [],
    categories: [categoryTag(category)],
  }
}

function convertLegacyExercise(raw: LegacyExercise): ApiExercise | null {
  if (raw.category !== "strength") return null
  const primary = raw.primaryMuscles.map(mapLegacyMuscle).find(Boolean)
  if (!primary) return null
  const secondary = raw.secondaryMuscles
    .map(mapLegacyMuscle)
    .filter((m): m is string => Boolean(m) && m !== primary)
  return makeExercise(raw.name, primary, legacyEquipmentCategory(raw.equipment), secondary, "-legacy")
}

/** Modern / specialty machines and gaps not covered by the upstream API or legacy DB. */
const CURATED_SUPPLEMENTS: Array<{
  name: string
  muscle: string
  category?: string
  secondary?: string[]
}> = [
  // Back — subdivided
  { name: "Wide-Grip Lat Pulldown", muscle: "Lats", category: "Machine" },
  { name: "Close-Grip Lat Pulldown", muscle: "Lats", category: "Machine" },
  { name: "Neutral-Grip Lat Pulldown", muscle: "Lats", category: "Machine" },
  { name: "Single-Arm Lat Pulldown", muscle: "Lats", category: "Cable" },
  { name: "Assisted Pull-Up Machine", muscle: "Lats", category: "Machine" },
  { name: "Chest-Supported Row Machine", muscle: "Upper Back", category: "Machine" },
  { name: "Iso-Lateral Row Machine", muscle: "Upper Back", category: "Machine" },
  { name: "Meadows Row", muscle: "Upper Back", category: "Free weight" },
  { name: "Seal Row", muscle: "Upper Back", category: "Free weight" },
  { name: "Cable High Row", muscle: "Upper Back", category: "Cable" },
  { name: "Straight-Arm Cable Pulldown", muscle: "Lats", category: "Cable" },
  { name: "Dumbbell Pullover", muscle: "Lats", category: "Free weight" },
  { name: "Machine Pullover", muscle: "Lats", category: "Machine" },
  { name: "Reverse Pec Deck", muscle: "Rhomboids", category: "Machine", secondary: ["Shoulders"] },
  { name: "Rhomboid Cable Row", muscle: "Rhomboids", category: "Cable" },
  { name: "45° Hyperextension", muscle: "Lower Back", category: "Body weight", secondary: ["Glutes", "Hamstrings"] },
  { name: "Back Extension Machine", muscle: "Lower Back", category: "Machine" },
  { name: "Good Morning", muscle: "Lower Back", category: "Free weight", secondary: ["Hamstrings", "Glutes"] },
  { name: "Rack Pull", muscle: "Lower Back", category: "Free weight", secondary: ["Trapezius", "Glutes"] },
  { name: "Sumo Deadlift", muscle: "Lower Back", category: "Free weight", secondary: ["Glutes", "Hamstrings"] },
  { name: "Trap Bar Deadlift", muscle: "Lower Back", category: "Free weight", secondary: ["Quadriceps", "Glutes"] },
  // Chest machines
  { name: "Plate-Loaded Chest Press", muscle: "Chest", category: "Machine" },
  { name: "Converging Chest Press", muscle: "Chest", category: "Machine" },
  { name: "Smith Machine Incline Press", muscle: "Chest", category: "Machine" },
  { name: "Cable Incline Fly", muscle: "Chest", category: "Cable" },
  { name: "Cable Decline Fly", muscle: "Chest", category: "Cable" },
  { name: "Landmine Press", muscle: "Chest", category: "Free weight", secondary: ["Shoulders", "Triceps"] },
  // Shoulder machines
  { name: "Shoulder Press Machine", muscle: "Shoulders", category: "Machine" },
  { name: "Lateral Raise Machine", muscle: "Shoulders", category: "Machine" },
  { name: "Rear Delt Machine", muscle: "Shoulders", category: "Machine" },
  { name: "Cable Y-Raise", muscle: "Shoulders", category: "Cable" },
  { name: "Landmine Lateral Raise", muscle: "Shoulders", category: "Free weight" },
  // Leg machines
  { name: "Belt Squat Machine", muscle: "Quadriceps", category: "Machine", secondary: ["Glutes"] },
  { name: "Pendulum Squat", muscle: "Quadriceps", category: "Machine", secondary: ["Glutes"] },
  { name: "Sissy Squat Machine", muscle: "Quadriceps", category: "Machine" },
  { name: "Hip Thrust Machine", muscle: "Glutes", category: "Machine", secondary: ["Hamstrings"] },
  { name: "Glute Kickback Machine", muscle: "Glutes", category: "Machine" },
  { name: "Glute Drive Machine", muscle: "Glutes", category: "Machine" },
  { name: "Standing Hip Abduction Machine", muscle: "Abductors", category: "Machine" },
  { name: "Seated Hip Abduction Machine", muscle: "Abductors", category: "Machine" },
  { name: "Donkey Calf Raise Machine", muscle: "Calves", category: "Machine" },
  { name: "Rotary Calf Machine", muscle: "Calves", category: "Machine" },
  { name: "Single-Leg Press", muscle: "Quadriceps", category: "Machine", secondary: ["Glutes"] },
  { name: "V-Squat Machine", muscle: "Quadriceps", category: "Machine", secondary: ["Glutes"] },
  { name: "Lying Leg Curl Machine", muscle: "Hamstrings", category: "Machine" },
  { name: "Seated Leg Curl Machine", muscle: "Hamstrings", category: "Machine" },
  { name: "Nordic Curl Machine", muscle: "Hamstrings", category: "Machine" },
  // Arm machines
  { name: "Tricep Dip Machine", muscle: "Triceps", category: "Machine" },
  { name: "Assisted Dip Machine", muscle: "Triceps", category: "Machine" },
  { name: "Overhead Tricep Machine", muscle: "Triceps", category: "Machine" },
  { name: "Preacher Curl Machine", muscle: "Biceps", category: "Machine" },
  { name: "Concentration Curl Machine", muscle: "Biceps", category: "Machine" },
  { name: "Reverse Curl Machine", muscle: "Forearms", category: "Machine", secondary: ["Biceps"] },
  { name: "Wrist Curl Machine", muscle: "Forearms", category: "Machine" },
  // Core machines
  { name: "Torso Rotation Machine", muscle: "Obliques", category: "Machine" },
  { name: "Oblique Crunch Machine", muscle: "Obliques", category: "Machine" },
  { name: "Roman Chair Knee Raise", muscle: "Abdominals", category: "Machine" },
  { name: "GHD Sit-Up", muscle: "Abdominals", category: "Machine" },
  // Cable / functional
  { name: "Cable Woodchopper", muscle: "Obliques", category: "Cable" },
  { name: "Landmine Row", muscle: "Upper Back", category: "Free weight", secondary: ["Lats"] },
  { name: "Sled Push", muscle: "Quadriceps", category: "Machine", secondary: ["Glutes", "Calves"] },
  { name: "Sled Drag", muscle: "Hamstrings", category: "Machine", secondary: ["Glutes"] },
  { name: "Farmers Walk", muscle: "Forearms", category: "Free weight", secondary: ["Trapezius", "Core"] },
  { name: "Battle Ropes", muscle: "Shoulders", category: "Free weight", secondary: ["Forearms", "Core"] },
  // Trap / neck
  { name: "Machine Shrug", muscle: "Trapezius", category: "Machine" },
  { name: "Cable Shrug", muscle: "Trapezius", category: "Cable" },
]

function remapApiBackMuscle(exercise: ApiExercise): ApiExercise {
  const hasBack = exercise.primaryMuscles.some((m) => normalizeName(m.name) === "back")
  if (!hasBack) return exercise
  const mapped = API_BACK_MUSCLE_BY_NAME[normalizeName(exercise.name)]
  if (!mapped) return exercise
  return {
    ...exercise,
    primaryMuscles: [muscleTag(mapped)],
  }
}

function buildLegacySupplements(): ApiExercise[] {
  const out: ApiExercise[] = []
  for (const raw of legacyExercises as LegacyExercise[]) {
    const converted = convertLegacyExercise(raw)
    if (converted) out.push(converted)
  }
  return out
}

function buildCuratedSupplements(): ApiExercise[] {
  return CURATED_SUPPLEMENTS.map((row) =>
    makeExercise(row.name, row.muscle, row.category ?? "Free weight", row.secondary ?? [], "-curated"),
  )
}

function mergeExerciseLibraries(apiExercises: ApiExercise[]): ApiExercise[] {
  const byName = new Map<string, ApiExercise>()

  const add = (exercise: ApiExercise, preferExisting = false) => {
    const key = normalizeName(exercise.name)
    if (!key) return
    if (preferExisting && byName.has(key)) return
    if (!byName.has(key)) {
      byName.set(key, exercise)
      return
    }
    // Prefer API entries over supplements when names collide.
    const existing = byName.get(key)!
    const existingIsApi = !existing.id.startsWith("local-")
    const incomingIsApi = !exercise.id.startsWith("local-")
    if (!existingIsApi && incomingIsApi) byName.set(key, exercise)
  }

  for (const ex of apiExercises) add(remapApiBackMuscle(ex), true)
  for (const ex of buildLegacySupplements()) add(ex)
  for (const ex of buildCuratedSupplements()) add(ex)

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/** Enrich upstream WorkoutAPI data with subdivided back muscles and a large local backfill. */
export function enrichExerciseLibrary(apiExercises: ApiExercise[]): ApiExercise[] {
  return mergeExerciseLibraries(apiExercises)
}

/** Compact offline list when the API is unreachable. */
export const FALLBACK_EXERCISES: ApiExercise[] = enrichExerciseLibrary([
  makeExercise("Bench Press", "Chest"),
  makeExercise("Incline Bench Press", "Chest"),
  makeExercise("Barbell Row", "Upper Back"),
  makeExercise("Lat Pulldown", "Lats", "Machine"),
  makeExercise("Pull-Ups", "Lats", "Body weight"),
  makeExercise("Deadlift", "Lower Back"),
  makeExercise("Back Extension", "Lower Back", "Machine"),
  makeExercise("Overhead Press", "Shoulders"),
  makeExercise("Squat", "Quadriceps"),
  makeExercise("Leg Press", "Quadriceps", "Machine"),
  makeExercise("Leg Curl", "Hamstrings", "Machine"),
  makeExercise("Barbell Curl", "Biceps"),
  makeExercise("Tricep Pushdown", "Triceps", "Cable"),
  makeExercise("Plank", "Abdominals", "Body weight"),
])
