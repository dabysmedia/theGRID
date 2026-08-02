import { describe, expect, it } from "vitest"
import { deferExercise } from "@/lib/workouts/active-queue"

describe("deferExercise", () => {
  it("adds a newly skipped exercise to the back of the queue", () => {
    expect(deferExercise(["a"], "b")).toEqual(["a", "b"])
  })

  it("moves a resurfaced exercise behind the other deferred work", () => {
    expect(deferExercise(["a", "b", "c"], "a")).toEqual(["b", "c", "a"])
  })

  it("removes stale duplicates while re-queueing", () => {
    expect(deferExercise(["a", "b", "a"], "a")).toEqual(["b", "a"])
  })
})
