import { describe, expect, it } from "vitest"
import { normalizeWorkoutSessionExercises } from "@/lib/workouts/session-exercises"

describe("normalizeWorkoutSessionExercises", () => {
  it("converts a planned routine's setRows into live workout sets", () => {
    const result = normalizeWorkoutSessionExercises(JSON.stringify([
      {
        id: "chest-press",
        name: "Chest Press",
        notes: "Controlled tempo",
        setRows: [
          { id: "row-1", weight: "100", reps: "10" },
          { id: "row-2", weight: "", reps: "8-12" },
        ],
      },
    ]))

    expect(result).toEqual([
      expect.objectContaining({
        id: "chest-press",
        name: "Chest Press",
        notes: "Controlled tempo",
        sets: [
          expect.objectContaining({
            id: "row-1",
            setNumber: 1,
            weight: 100,
            reps: 10,
            type: "working",
            completed: false,
          }),
          expect.objectContaining({
            id: "row-2",
            setNumber: 2,
            weight: null,
            reps: null,
            type: "working",
            completed: false,
          }),
        ],
      }),
    ])
  })

  it("preserves the live workout shape and completion state", () => {
    const result = normalizeWorkoutSessionExercises([
      {
        id: "row",
        name: "Row",
        sets: [
          {
            id: "set-1",
            setNumber: 1,
            weight: 80,
            reps: 12,
            type: "warmup",
            completed: true,
            rir: 3,
          },
        ],
      },
    ])

    expect(result[0]?.sets[0]).toEqual(
      expect.objectContaining({
        id: "set-1",
        weight: 80,
        reps: 12,
        type: "warmup",
        completed: true,
        rir: 3,
      }),
    )
  })

  it("returns an empty list for corrupt persisted JSON", () => {
    expect(normalizeWorkoutSessionExercises("not json")).toEqual([])
  })
})
