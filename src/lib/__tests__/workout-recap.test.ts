import { describe, expect, it } from "vitest"
import { buildWorkoutRecap, estimateOneRepMax } from "@/lib/workouts/workout-recap"
import { parseActiveWorkoutUiState } from "@/lib/workouts/active-workout-ui-state"

describe("estimateOneRepMax", () => {
  it("treats a single rep as its own max", () => {
    expect(estimateOneRepMax(225, 1)).toBe(225)
  })

  it("scales heavier for more reps", () => {
    expect(estimateOneRepMax(200, 10)).toBeCloseTo(266.67, 1)
  })

  it("ignores empty sets", () => {
    expect(estimateOneRepMax(0, 8)).toBe(0)
    expect(estimateOneRepMax(135, 0)).toBe(0)
  })
})

describe("buildWorkoutRecap", () => {
  const previous = [
    {
      exercises: [
        {
          name: "Bench Press",
          sets: [{ weight: 185, reps: 5, completed: true, type: "working" }],
        },
      ],
    },
  ]

  it("totals completed sets and working volume", () => {
    const recap = buildWorkoutRecap({
      durationMin: 47.6,
      previous: [],
      exercises: [
        {
          name: "Bench Press",
          sets: [
            { weight: 45, reps: 10, completed: true, type: "warmup" },
            { weight: 135, reps: 8, completed: true, type: "working" },
            { weight: 135, reps: 8, completed: false, type: "working" },
          ],
        },
      ],
    })
    expect(recap.durationMin).toBe(48)
    expect(recap.setsDone).toBe(2)
    expect(recap.setsPlanned).toBe(3)
    expect(recap.volume).toBe(1080)
    expect(recap.movements[0]?.bestSet).toEqual({ weight: 135, reps: 8 })
  })

  it("flags a personal record against history", () => {
    const recap = buildWorkoutRecap({
      durationMin: 30,
      previous,
      exercises: [
        {
          name: "bench press",
          sets: [{ weight: 190, reps: 5, completed: true, type: "working" }],
        },
      ],
    })
    expect(recap.movements[0]?.isPr).toBe(true)
    expect(recap.prCount).toBe(1)
  })

  it("does not call a first-ever movement a record", () => {
    const recap = buildWorkoutRecap({
      durationMin: 30,
      previous,
      exercises: [
        {
          name: "Cable Fly",
          sets: [{ weight: 40, reps: 12, completed: true, type: "working" }],
        },
      ],
    })
    expect(recap.movements[0]?.isPr).toBe(false)
  })

  it("leaves untouched movements out of the recap list", () => {
    const recap = buildWorkoutRecap({
      durationMin: 10,
      previous: [],
      exercises: [
        { name: "Squat", sets: [{ weight: 225, reps: 5, completed: false }] },
      ],
    })
    expect(recap.movements).toHaveLength(0)
    expect(recap.setsPlanned).toBe(1)
  })
})

describe("parseActiveWorkoutUiState", () => {
  it("returns null for missing or corrupt storage", () => {
    expect(parseActiveWorkoutUiState(null)).toBeNull()
    expect(parseActiveWorkoutUiState("{not json")).toBeNull()
    expect(parseActiveWorkoutUiState("[]")).toBeNull()
  })

  it("keeps valid fields and drops junk", () => {
    const state = parseActiveWorkoutUiState(
      JSON.stringify({
        skipped: ["a", 3, ""],
        acked: ["b"],
        pinned: "c",
        restEndsAt: 1_700_000_000_000,
        restTotalSec: -5,
        touched: "nope",
        ghost: ["d"],
      }),
    )
    expect(state).toEqual({
      skipped: ["a"],
      acked: ["b"],
      pinned: "c",
      restEndsAt: 1_700_000_000_000,
      restTotalSec: null,
      touched: [],
      ghost: ["d"],
    })
  })
})
