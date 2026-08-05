export interface PlannedWorkoutLike {
  id: string
  name: string
  exercises: unknown
}

export interface WorkoutTemplateLike {
  id: string
  name: string
  exercises: unknown
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function parseExercises(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

function exerciseSignature(value: unknown): string | null {
  const exercises = parseExercises(value)
  if (!exercises || exercises.length === 0) return null
  return JSON.stringify(stableValue(exercises))
}

/**
 * Resolve the routine represented by a copied workout plan. Exercise payloads
 * are compared independent of JSON property order. A unique name is a safe
 * fallback when a routine was edited after the plan was scheduled.
 */
export function findTemplateForPlannedWorkout<
  TPlan extends PlannedWorkoutLike,
  TTemplate extends WorkoutTemplateLike,
>(plan: TPlan, templates: TTemplate[]): TTemplate | null {
  const planSignature = exerciseSignature(plan.exercises)
  if (planSignature) {
    const exact = templates.filter(
      (template) => exerciseSignature(template.exercises) === planSignature,
    )
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) {
      const nameMatches = exact.filter(
        (template) => normalizedName(template.name) === normalizedName(plan.name),
      )
      if (nameMatches.length === 1) return nameMatches[0]
    }
  }

  const nameMatches = templates.filter(
    (template) => normalizedName(template.name) === normalizedName(plan.name),
  )
  return nameMatches.length === 1 ? nameMatches[0] : null
}

export function plannedWorkoutMatchesTemplate(
  plan: PlannedWorkoutLike,
  template: WorkoutTemplateLike,
  templates: WorkoutTemplateLike[],
): boolean {
  return findTemplateForPlannedWorkout(plan, templates)?.id === template.id
}

/**
 * Workouts follow the wall-clock calendar. During the app's midnight-to-5am
 * steps window, both the active tracking key and calendar key mean "today";
 * either must surface the real calendar-today workout plan.
 */
export function resolveWorkoutPlanDayKey({
  requestedDay,
  trackingDay,
  calendarDay,
}: {
  requestedDay: string
  trackingDay: string
  calendarDay: string
}): string {
  return requestedDay === trackingDay || requestedDay === calendarDay
    ? calendarDay
    : requestedDay
}
