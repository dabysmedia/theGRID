import { describe, expect, it } from "vitest"
import {
  aggregateMuscleStats,
  muscleStatsToSegmentScores,
  type WorkoutSessionLike,
} from "@/lib/workouts/muscle-volume"

function completedSession(overrides: Partial<WorkoutSessionLike> = {}): WorkoutSessionLike {
  return {
    id: "session-1",
    date: "2026-07-13T12:00:00.000Z",
    exercises: [
      {
        primaryMuscles: [{ name: "Shoulders", color: "#f77f00" }],
        secondaryMuscles: [{ name: "Triceps", color: "#2dc653" }],
        sets: [
          { weight: 30, reps: 10, completed: true },
          { weight: 30, reps: 8, completed: true },
          { weight: null, reps: 8, completed: false },
        ],
      },
    ],
    ...overrides,
  }
}

describe("workout muscle load", () => {
  it("turns completed workout sets into visible body-map scores", () => {
    const stats = aggregateMuscleStats(
      [completedSession()],
      "2026-07-13",
      "2026-07-19",
    )

    expect(stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ muscle: "Shoulders", sets: 2, volumeLb: 540 }),
        expect.objectContaining({ muscle: "Triceps", sets: 0.8, volumeLb: 216 }),
      ]),
    )

    const scores = muscleStatsToSegmentScores(stats)
    expect(Object.entries(scores)).toEqual(
      expect.arrayContaining([
        [expect.stringMatching(/:deltoids:/), 2],
        [expect.stringMatching(/:triceps:/), 0.8],
      ]),
    )
  })

  it("ignores sessions outside the selected week", () => {
    const stats = aggregateMuscleStats(
      [completedSession({ date: "2026-07-12T12:00:00.000Z" })],
      "2026-07-13",
      "2026-07-19",
    )

    expect(stats).toEqual([])
  })

  it("maps exercise-library abductor labels onto the glute body region", () => {
    const stats = aggregateMuscleStats(
      [
        completedSession({
          exercises: [
            {
              primaryMuscles: [{ name: "Abductors" }],
              sets: [{ weight: 80, reps: 12, completed: true }],
            },
          ],
        }),
      ],
      "2026-07-13",
      "2026-07-19",
    )

    const scores = muscleStatsToSegmentScores(stats)
    expect(Object.keys(scores).some((key) => key.includes(":gluteal:"))).toBe(true)
  })
})
