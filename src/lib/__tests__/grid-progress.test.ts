import { describe, expect, it } from "vitest"
import {
  addDaysYmdSafe,
  assembleProgressSnapshot,
  computeStreaks,
  emptyDayValues,
  heatmapIntensity,
  isGoalHit,
  levelFromXp,
  mondayOnOrBefore,
  rankName,
  scoreDay,
  xpThresholdForLevel,
  type DayValues,
  type ProgressGoals,
  type TrackKey,
} from "@/lib/grid-progress"

const goals: ProgressGoals = {
  calories: { target: 2000, direction: "down" },
  steps: { target: 10000, direction: "up" },
  sleep: { target: 8, direction: "up" },
  water: { target: 32, direction: "up" },
}

const allTracks: TrackKey[] = [
  "calories",
  "steps",
  "sleep",
  "training",
  "weight",
  "water",
  "habits",
  "journal",
]

function day(partial: Partial<DayValues>): DayValues {
  return { ...emptyDayValues(), ...partial }
}

describe("levelFromXp", () => {
  it("starts at Spark with no XP", () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, name: "Spark", xpIntoLevel: 0 })
    expect(xpThresholdForLevel(1)).toBe(0)
  })

  it("crosses into Signal at 90 XP", () => {
    expect(levelFromXp(89).level).toBe(1)
    expect(levelFromXp(90)).toMatchObject({ level: 2, name: "Signal", xpIntoLevel: 0 })
  })

  it("uses a quadratic curve so later levels take longer", () => {
    expect(xpThresholdForLevel(5)).toBe(90 * 16)
    expect(levelFromXp(90 * 16).level).toBe(5)
    expect(rankName(12)).toBe("Prime 12")
  })
})

describe("isGoalHit", () => {
  it("requires a log before a down-goal can complete", () => {
    expect(isGoalHit(0, 2000, "down", false)).toBe(false)
    expect(isGoalHit(1800, 2000, "down", true)).toBe(true)
    expect(isGoalHit(2200, 2000, "down", true)).toBe(false)
  })

  it("completes up-goals at or above target", () => {
    expect(isGoalHit(9999, 10000, "up", true)).toBe(false)
    expect(isGoalHit(10000, 10000, "up", true)).toBe(true)
  })
})

describe("scoreDay", () => {
  it("awards a check-in when two core tracks are logged", () => {
    const scored = scoreDay(
      "2026-09-17",
      day({ calories: 1600, steps: 4000 }),
      goals,
      allTracks,
    )
    expect(scored.checkIn).toBe(true)
    expect(scored.perfect).toBe(false)
    expect(scored.xp).toBeGreaterThan(15)
  })

  it("awards a perfect-day bonus when calories, steps, and sleep hit", () => {
    const scored = scoreDay(
      "2026-09-17",
      day({ calories: 1900, steps: 12000, sleepHrs: 8.2 }),
      goals,
      allTracks,
    )
    expect(scored.perfect).toBe(true)
    expect(scored.xp).toBeGreaterThanOrEqual(12 + 18 + 12 + 18 + 12 + 18 + 15 + 25)
  })

  it("treats a workout, run, or cardio session as training", () => {
    expect(scoreDay("2026-09-17", day({ cardioMinutes: 30 }), goals, allTracks).tracks.find((t) => t.key === "training")?.logged).toBe(true)
    expect(scoreDay("2026-09-17", day({ runMiles: 3.1 }), goals, allTracks).tracks.find((t) => t.key === "training")?.logged).toBe(true)
    expect(scoreDay("2026-09-17", day({ workouts: 1 }), goals, allTracks).tracks.find((t) => t.key === "training")?.logged).toBe(true)
  })
})

describe("computeStreaks", () => {
  it("keeps today's streak alive until the day is missed", () => {
    const scores = [
      scoreDay("2026-09-15", day({ calories: 1800, steps: 11000 }), goals, allTracks),
      scoreDay("2026-09-16", day({ calories: 1700, sleepHrs: 8 }), goals, allTracks),
      scoreDay("2026-09-17", emptyDayValues(), goals, allTracks),
    ]
    const streak = computeStreaks(scores, "2026-09-17", true)
    expect(streak.current).toBe(2)
    expect(streak.atRisk).toBe(true)
    expect(streak.best).toBe(2)
  })

  it("breaks the streak on a historical miss", () => {
    const scores = [
      scoreDay("2026-09-15", day({ calories: 1800, steps: 11000 }), goals, allTracks),
      scoreDay("2026-09-16", emptyDayValues(), goals, allTracks),
      scoreDay("2026-09-17", day({ calories: 1800, steps: 11000 }), goals, allTracks),
    ]
    const streak = computeStreaks(scores, "2026-09-17", false)
    expect(streak.current).toBe(1)
    expect(streak.atRisk).toBe(false)
    expect(streak.best).toBe(1)
  })
})

describe("heatmap + snapshot", () => {
  it("aligns heatmap weeks to Monday", () => {
    expect(mondayOnOrBefore("2026-09-17")).toBe("2026-09-14")
    expect(addDaysYmdSafe("2026-09-14", 7)).toBe("2026-09-21")
  })

  it("maps XP bands onto 0–4 intensity", () => {
    expect(heatmapIntensity(0, false, false)).toBe(0)
    expect(heatmapIntensity(20, false, false)).toBe(1)
    expect(heatmapIntensity(30, true, false)).toBe(2)
    expect(heatmapIntensity(80, true, false)).toBe(3)
    expect(heatmapIntensity(90, true, true)).toBe(4)
  })

  it("builds a snapshot with milestones and 30-day consistency", () => {
    const days = new Map<string, DayValues>()
    for (let i = 0; i < 10; i++) {
      const date = addDaysYmdSafe("2026-09-08", i)
      days.set(date, day({ calories: 1800, steps: 11000, sleepHrs: 8 }))
    }
    const snap = assembleProgressSnapshot({
      asOf: "2026-09-17",
      isCurrent: true,
      rangeStart: "2026-08-19",
      days,
      goals,
      enabledTracks: allTracks,
    })
    expect(snap.streak.current).toBe(10)
    expect(snap.consistency30).toBeGreaterThan(0)
    expect(snap.today.perfect).toBe(true)
    expect(snap.milestones.find((m) => m.id === "first_spark")?.earned).toBe(true)
    expect(snap.milestones.find((m) => m.id === "streak_7")?.earned).toBe(true)
    expect(snap.heatmap).toHaveLength(16)
    expect(snap.heatmap[0].days).toHaveLength(7)
  })
})
