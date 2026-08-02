import { describe, expect, it } from "vitest"
import {
  buildExerciseProfile,
  calculateNextSetRecommendation,
  type PoExercise,
  type PoSession,
} from "../progressive-overload"
import {
  normalizeTrainingStyle,
  progressionOverridesForStyle,
  TRAINING_STYLE_DEFINITIONS,
} from "../training-style"

const currentExercise: PoExercise = {
  id: "current-exercise",
  name: "Barbell Bench Press",
  category: "Free weights",
  sets: [
    {
      id: "current-set",
      setNumber: 1,
      weight: null,
      reps: null,
      type: "working",
      completed: false,
    },
  ],
}

describe("training style", () => {
  it("defaults missing and unknown profile values to Science-Based", () => {
    expect(normalizeTrainingStyle(undefined)).toBe("science_based")
    expect(normalizeTrainingStyle("unknown")).toBe("science_based")
    expect(normalizeTrainingStyle("classic")).toBe("classic")
  })

  it("leaves the Science-Based exercise profile unchanged", () => {
    const profile = buildExerciseProfile(
      currentExercise.name,
      currentExercise.category,
      progressionOverridesForStyle("science_based"),
    )
    expect(profile).toMatchObject({
      repMin: 8,
      repMax: 12,
      targetRir: 2,
      calibrationRir: 3,
      maxWorkingSets: 5,
      allowExtraSets: true,
    })
  })

  it("uses two hard sets and near-failure defaults in Classic", () => {
    const overrides = progressionOverridesForStyle("classic")
    const profile = buildExerciseProfile(
      currentExercise.name,
      currentExercise.category,
      overrides,
    )
    expect(TRAINING_STYLE_DEFINITIONS.classic.workingSetTarget).toBe(2)
    expect(profile).toMatchObject({
      repMin: 6,
      repMax: 10,
      targetRir: 1,
      calibrationRir: 2,
      maxWorkingSets: 2,
      allowExtraSets: false,
    })
  })

  it("keeps first-exposure calibration conservative in Classic", () => {
    const rec = calculateNextSetRecommendation({
      exercise: currentExercise,
      sessions: [],
      overrides: progressionOverridesForStyle("classic"),
    })
    expect(rec).toMatchObject({ repMin: 6, repMax: 10, targetRir: 2 })
  })

  it("uses the Classic 1 RIR target once exercise history exists", () => {
    const history: PoSession[] = [
      {
        id: "previous-session",
        date: "2026-07-20",
        startedAt: "2026-07-20T12:00:00.000Z",
        finishedAt: "2026-07-20T13:00:00.000Z",
        status: "completed",
        exercises: JSON.stringify([
          {
            ...currentExercise,
            id: "previous-exercise",
            sets: [
              {
                id: "previous-1",
                setNumber: 1,
                weight: 185,
                reps: 8,
                type: "working",
                completed: true,
                rir: 1,
              },
              {
                id: "previous-2",
                setNumber: 2,
                weight: 185,
                reps: 7,
                type: "working",
                completed: true,
                rir: 1,
              },
            ],
          },
        ]),
      },
    ]
    const rec = calculateNextSetRecommendation({
      exercise: currentExercise,
      sessions: history,
      overrides: progressionOverridesForStyle("classic"),
    })
    expect(rec.targetRir).toBe(1)
    expect(rec.repMin).toBe(6)
    expect(rec.repMax).toBe(10)
  })

  it("lets explicit per-movement choices override the global style", () => {
    expect(
      progressionOverridesForStyle("classic", { repMin: 8, repMax: 12, targetRir: 2 }),
    ).toMatchObject({
      repMin: 8,
      repMax: 12,
      targetRir: 2,
      maxWorkingSets: 2,
      allowExtraSets: false,
    })
  })
})
