import { describe, expect, it } from "vitest"
import {
  findTemplateForPlannedWorkout,
  plannedWorkoutMatchesTemplate,
  resolveWorkoutPlanDayKey,
} from "@/lib/workouts/planned-workout-match"

describe("planned workout matching", () => {
  it("matches copied exercises independent of JSON property order", () => {
    const plan = {
      id: "plan-lower",
      name: "Lower",
      exercises: '[{"name":"Goblet Squat","id":"squat"}]',
    }
    const templates = [
      {
        id: "lower",
        name: "Lower",
        exercises: '[{"id":"squat","name":"Goblet Squat"}]',
      },
      {
        id: "upper",
        name: "Upper",
        exercises: '[{"id":"press","name":"Bench Press"}]',
      },
    ]

    expect(findTemplateForPlannedWorkout(plan, templates)?.id).toBe("lower")
    expect(plannedWorkoutMatchesTemplate(plan, templates[0], templates)).toBe(true)
    expect(plannedWorkoutMatchesTemplate(plan, templates[1], templates)).toBe(false)
  })

  it("uses a unique routine name after the routine payload changes", () => {
    const plan = { id: "plan", name: "Lower day", exercises: "[]" }
    const templates = [
      { id: "lower", name: " lower   day ", exercises: "[]" },
      { id: "upper", name: "Upper day", exercises: "[]" },
    ]
    expect(findTemplateForPlannedWorkout(plan, templates)?.id).toBe("lower")
  })

  it("does not guess when duplicate routine names are ambiguous", () => {
    const plan = { id: "plan", name: "TEST", exercises: "[]" }
    const templates = [
      { id: "one", name: "TEST", exercises: "[]" },
      { id: "two", name: "test", exercises: "[]" },
    ]
    expect(findTemplateForPlannedWorkout(plan, templates)).toBeNull()
  })
})

describe("resolveWorkoutPlanDayKey", () => {
  it("surfaces calendar-today plans during the overnight tracking window", () => {
    expect(
      resolveWorkoutPlanDayKey({
        requestedDay: "2026-08-04",
        trackingDay: "2026-08-04",
        calendarDay: "2026-08-05",
      }),
    ).toBe("2026-08-05")
    expect(
      resolveWorkoutPlanDayKey({
        requestedDay: "2026-08-05",
        trackingDay: "2026-08-04",
        calendarDay: "2026-08-05",
      }),
    ).toBe("2026-08-05")
  })

  it("leaves historical workout dates unchanged", () => {
    expect(
      resolveWorkoutPlanDayKey({
        requestedDay: "2026-08-03",
        trackingDay: "2026-08-04",
        calendarDay: "2026-08-05",
      }),
    ).toBe("2026-08-03")
  })
})
