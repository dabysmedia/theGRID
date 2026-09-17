import { describe, expect, it } from "vitest"
import {
  aggregateLiveMuscleStats,
  aggregateMuscleStats,
  formatSetCount,
  liveStatsToSegmentScores,
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

describe("live session muscle load", () => {
  const pushSession = {
    primaryMuscles: [{ name: "Chest", color: "#d62828" }],
    secondaryMuscles: [{ name: "Triceps", color: "#2dc653" }],
    sets: [
      { weight: 45, reps: 12, completed: true, type: "warmup" as const },
      { weight: 135, reps: 8, completed: true, type: "working" as const },
      { weight: 155, reps: 6, completed: true, type: "working" as const },
      { weight: 155, reps: 6, completed: false, type: "working" as const },
      { weight: 155, reps: 6, completed: false, type: "working" as const },
    ],
  }

  it("counts only completed working sets and keeps planned targets", () => {
    const stats = aggregateLiveMuscleStats([pushSession])

    expect(stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          muscle: "Chest",
          completedSets: 2,
          plannedSets: 4,
          volumeLb: 135 * 8 + 155 * 6,
        }),
        expect.objectContaining({
          muscle: "Triceps",
          completedSets: 0.8,
          plannedSets: 1.6,
        }),
      ]),
    )
  })

  it("does not treat prefilled incomplete sets as done", () => {
    const stats = aggregateLiveMuscleStats([
      {
        primaryMuscles: [{ name: "Quadriceps" }],
        sets: [
          { weight: 185, reps: 8, completed: false, type: "working" },
          { weight: 185, reps: 8, completed: false, type: "working" },
        ],
      },
    ])

    expect(stats).toEqual([
      expect.objectContaining({
        muscle: "Quadriceps",
        completedSets: 0,
        plannedSets: 2,
        volumeLb: 0,
      }),
    ])
  })

  it("lights the body map from completed live sets only", () => {
    const stats = aggregateLiveMuscleStats([pushSession])
    const scores = liveStatsToSegmentScores(stats)

    expect(Object.entries(scores)).toEqual(
      expect.arrayContaining([
        [expect.stringMatching(/:chest:/), 2],
        [expect.stringMatching(/:triceps:/), 0.8],
      ]),
    )
  })

  it("formats fractional secondary set counts", () => {
    expect(formatSetCount(2)).toBe("2")
    expect(formatSetCount(0.8)).toBe("0.8")
    expect(formatSetCount(0)).toBe("0")
  })
})
