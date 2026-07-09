import { describe, expect, it } from "vitest"
import type { ApiExercise } from "../exercise-library"
import {
  aggregateExerciseFrequency,
  inferPatternBucket,
  isLowerBodyMuscle,
  isUpperBodyMuscle,
  recommendFreeFormWorkout,
} from "../free-form-recommender"

function muscle(name: string, code = name.slice(0, 2).toUpperCase()) {
  return { id: code, code, color: "#c4d632", name }
}

function libEx(
  name: string,
  primary: string,
  category = "Free weight",
  secondary: string[] = [],
): ApiExercise {
  return {
    id: name,
    code: name,
    name,
    primaryMuscles: [muscle(primary)],
    secondaryMuscles: secondary.map((s) => muscle(s)),
    types: [],
    categories: [{ id: category, code: category, name: category }],
  }
}

const LIBRARY: ApiExercise[] = [
  libEx("Barbell Bench Press", "Chest", "Free weight", ["Triceps"]),
  libEx("Incline Dumbbell Press", "Chest", "Free weight"),
  libEx("Lat Pulldown", "Lats", "Cable"),
  libEx("Seated Cable Row", "Upper Back", "Cable"),
  libEx("Dumbbell Shoulder Press", "Shoulders", "Free weight"),
  libEx("Triceps Pushdown", "Triceps", "Cable"),
  libEx("Barbell Curl", "Biceps", "Free weight"),
  libEx("Cable Crunch", "Abdominals", "Cable"),
  libEx("Back Squat", "Quadriceps", "Free weight", ["Glutes"]),
  libEx("Romanian Deadlift", "Hamstrings", "Free weight", ["Glutes"]),
  libEx("Walking Lunge", "Quadriceps", "Free weight", ["Glutes"]),
  libEx("Hip Thrust", "Glutes", "Free weight"),
  libEx("Standing Calf Raise", "Calves", "Machine"),
  libEx("Treadmill Run", "Cardio", "Machine"),
]

function session(
  daysAgo: number,
  exercises: Array<{ name: string; primary: string; sets?: number }>,
) {
  const when = new Date(Date.now() - daysAgo * 86_400_000)
  return {
    id: `s-${daysAgo}`,
    date: when.toISOString().slice(0, 10),
    exercises: exercises.map((e) => ({
      name: e.name,
      primaryMuscles: [{ name: e.primary }],
      sets: Array.from({ length: e.sets ?? 3 }, () => ({
        weight: 100,
        reps: 10,
        completed: true,
      })),
    })),
  }
}

describe("body split helpers", () => {
  it("classifies upper and lower muscles", () => {
    expect(isUpperBodyMuscle("Chest")).toBe(true)
    expect(isUpperBodyMuscle("Lats")).toBe(true)
    expect(isLowerBodyMuscle("Quadriceps")).toBe(true)
    expect(isLowerBodyMuscle("Glutes")).toBe(true)
    expect(isUpperBodyMuscle("Quadriceps")).toBe(false)
  })

  it("infers pattern buckets", () => {
    expect(inferPatternBucket("Barbell Bench Press", "Chest")).toBe("horizontal_push")
    expect(inferPatternBucket("Lat Pulldown", "Lats")).toBe("vertical_pull")
    expect(inferPatternBucket("Back Squat", "Quadriceps")).toBe("squat")
    expect(inferPatternBucket("Romanian Deadlift", "Hamstrings")).toBe("hinge")
  })
})

describe("aggregateExerciseFrequency", () => {
  it("counts sessions and sets per exercise", () => {
    const freq = aggregateExerciseFrequency([
      session(1, [{ name: "Barbell Bench Press", primary: "Chest", sets: 4 }]),
      session(3, [{ name: "Barbell Bench Press", primary: "Chest", sets: 3 }]),
      session(5, [{ name: "Lat Pulldown", primary: "Lats", sets: 3 }]),
    ])
    expect(freq.get("barbell bench press")?.sessionCount).toBe(2)
    expect(freq.get("barbell bench press")?.setCount).toBe(7)
    expect(freq.get("lat pulldown")?.sessionCount).toBe(1)
  })
})

describe("recommendFreeFormWorkout", () => {
  const weekStart = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
  const weekEnd = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10)

  it("returns only upper-body movements for upper split", () => {
    const recs = recommendFreeFormWorkout({
      library: LIBRARY,
      sessions: [
        session(1, [
          { name: "Barbell Bench Press", primary: "Chest", sets: 4 },
          { name: "Lat Pulldown", primary: "Lats", sets: 3 },
        ]),
      ],
      split: "upper",
      weekStart,
      weekEnd,
      count: 5,
    })
    expect(recs.length).toBeGreaterThanOrEqual(4)
    expect(recs.length).toBeLessThanOrEqual(5)
    for (const r of recs) {
      expect(isUpperBodyMuscle(r.primaryMuscles[0]?.name ?? "")).toBe(true)
    }
    expect(recs.some((r) => /cardio|treadmill/i.test(r.name))).toBe(false)
  })

  it("returns only lower-body movements for lower split", () => {
    const recs = recommendFreeFormWorkout({
      library: LIBRARY,
      sessions: [],
      split: "lower",
      weekStart,
      weekEnd,
      count: 5,
    })
    expect(recs.length).toBeGreaterThanOrEqual(4)
    for (const r of recs) {
      expect(isLowerBodyMuscle(r.primaryMuscles[0]?.name ?? "")).toBe(true)
    }
  })

  it("prefers undertrained muscles and favorites", () => {
    // Heavy chest volume this week; no back work. User loves rows historically.
    const recs = recommendFreeFormWorkout({
      library: LIBRARY,
      sessions: [
        session(1, [{ name: "Barbell Bench Press", primary: "Chest", sets: 8 }]),
        session(10, [{ name: "Seated Cable Row", primary: "Upper Back", sets: 4 }]),
        session(17, [{ name: "Seated Cable Row", primary: "Upper Back", sets: 4 }]),
        session(24, [{ name: "Seated Cable Row", primary: "Upper Back", sets: 4 }]),
      ],
      split: "upper",
      weekStart,
      weekEnd,
      count: 5,
    })
    const names = recs.map((r) => r.name)
    expect(names).toContain("Seated Cable Row")
    // Should include a pull to fill back volume
    expect(
      recs.some((r) =>
        ["Lats", "Upper Back"].includes(r.primaryMuscles[0]?.name ?? ""),
      ),
    ).toBe(true)
  })

  it("respects excludeNames", () => {
    const recs = recommendFreeFormWorkout({
      library: LIBRARY,
      sessions: [],
      split: "upper",
      weekStart,
      weekEnd,
      count: 5,
      excludeNames: ["Barbell Bench Press", "Lat Pulldown"],
    })
    expect(recs.every((r) => r.name !== "Barbell Bench Press")).toBe(true)
    expect(recs.every((r) => r.name !== "Lat Pulldown")).toBe(true)
  })
})
