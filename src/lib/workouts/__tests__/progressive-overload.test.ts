import { describe, expect, it } from "vitest"
import {
  calculateExerciseSimilarity,
  calculateInitialPrescription,
  calculateNextSetRecommendation,
  evaluateCompletedSet,
  filterOutlierSets,
  getComparableExerciseHistory,
  isValidWorkingSet,
  rirToRpe,
  roundToIncrement,
  rpeToRir,
  selectRecommendationSource,
  summarizeMovementPerformance,
  summarizeWorkoutProgression,
  type PoExercise,
  type PoSession,
  type PoSet,
} from "../progressive-overload"

/* ── Test data helpers ─────────────────────────────── */

let counter = 0
const uid = () => `id${++counter}`

function set(
  weight: number | null,
  reps: number | null,
  extra?: Partial<PoSet>,
): PoSet {
  return {
    id: uid(),
    setNumber: 0,
    weight,
    reps,
    type: "working",
    completed: true,
    ...extra,
  }
}

function exercise(
  name: string,
  sets: PoSet[],
  extra?: Partial<PoExercise>,
): PoExercise {
  return {
    id: uid(),
    name,
    sets: sets.map((s, i) => ({ ...s, setNumber: i + 1 })),
    ...extra,
  }
}

function session(
  daysAgo: number,
  exercises: PoExercise[] | string,
  extra?: Partial<PoSession>,
): PoSession {
  const when = new Date(Date.now() - daysAgo * 86_400_000)
  return {
    id: uid(),
    date: when.toISOString(),
    startedAt: when.toISOString(),
    finishedAt: when.toISOString(),
    status: "completed",
    exercises,
    ...extra,
  }
}

/** Triceps Pushdown defaults: 8–12 reps @ 2 RIR, cable, 5 lb increment. */
function pushdownHistory(daysAgo = 3): PoSession {
  return session(daysAgo, [
    exercise("Triceps Pushdown", [
      set(50, 10, { rir: 2 }),
      set(50, 10, { rir: 2 }),
      set(50, 9, { rir: 2 }),
    ], { category: "Cable" }),
  ])
}

/* ── Conversions & rounding ────────────────────────── */

describe("RIR/RPE conversion", () => {
  it("converts 2 RIR to RPE 8 and back", () => {
    expect(rirToRpe(2)).toBe(8)
    expect(rpeToRir(8)).toBe(2)
  })
})

describe("roundToIncrement", () => {
  it("never produces impossible loads between increments", () => {
    expect(roundToIncrement(47, 5, "nearest")).toBe(45)
    expect(roundToIncrement(47, 5, "down")).toBe(45)
    expect(roundToIncrement(47, 5, "up")).toBe(50)
    expect(roundToIncrement(101.25, 10, "down")).toBe(100)
  })
  it("passes values through when increment is 0 (bodyweight)", () => {
    expect(roundToIncrement(50, 0)).toBe(50)
  })
})

/* ── History extraction ────────────────────────────── */

describe("getComparableExerciseHistory", () => {
  it("matches by normalized name and excludes warm-ups, incomplete and flagged sets", () => {
    const s = session(1, [
      exercise("Lat Pulldown", [
        set(60, 10, { type: "warmup" }),
        set(100, 10, { rir: 2 }),
        set(100, 9, { completed: false }),
        set(100, 8, { painFlag: true }),
      ]),
    ])
    const exposures = getComparableExerciseHistory([s], "  lat   PULLDOWN ")
    expect(exposures).toHaveLength(1)
    expect(exposures[0].sets).toHaveLength(1)
    expect(exposures[0].sets[0].reps).toBe(10)
  })

  it("parses legacy JSON-string exercises without the new per-set fields", () => {
    const legacy = session(
      2,
      JSON.stringify([
        {
          id: "x",
          name: "Lat Pulldown",
          notes: "",
          sets: [
            { id: "a", setNumber: 1, weight: 100, reps: 10, type: "working", completed: true },
          ],
        },
      ]),
    )
    const exposures = getComparableExerciseHistory([legacy], "Lat Pulldown")
    expect(exposures).toHaveLength(1)
    expect(exposures[0].medianRir).toBeNull()
  })

  it("excludes extreme outlier entries that look like logging mistakes", () => {
    const { kept, excluded } = filterOutlierSets([
      set(45, 10),
      set(450, 10),
      set(45, 11),
      set(45, 12),
    ])
    expect(excluded).toBe(1)
    expect(kept.every((s) => s.weight === 45)).toBe(true)
  })

  it("treats drop sets as not valid for progression baselines", () => {
    expect(isValidWorkingSet(set(50, 10, { type: "dropset" }))).toBe(false)
    expect(isValidWorkingSet(set(50, 10, { type: "failure" }))).toBe(true)
  })
})

/* ── Source selection ──────────────────────────────── */

describe("selectRecommendationSource", () => {
  const bench = exercise(
    "Barbell Bench Press",
    [set(135, 10, { rir: 2 }), set(135, 10, { rir: 2 }), set(135, 9, { rir: 1 })],
    { category: "Free weight", primaryMuscles: [{ name: "Chest" }] },
  )

  it("prefers exact history when present", () => {
    const src = selectRecommendationSource([session(1, [bench])], {
      name: "Barbell Bench Press",
      category: "Free weight",
      primaryMuscles: [{ name: "Chest" }],
    })
    expect(src.kind).toBe("exact")
  })

  it("falls back to a credible similar movement when exact history is absent", () => {
    const src = selectRecommendationSource([session(1, [bench])], {
      name: "Machine Chest Press",
      category: "Machine",
      primaryMuscles: [{ name: "Chest" }],
    })
    expect(src.kind).toBe("similar")
    expect(src.sourceExerciseName).toBe("Barbell Bench Press")
    expect(src.loadRatio).toBeLessThan(1)
  })

  it("does not borrow from unrelated movements", () => {
    const squat = exercise("Barbell Squat", [set(225, 8, { rir: 2 })], {
      category: "Free weight",
      primaryMuscles: [{ name: "Quadriceps" }],
    })
    const src = selectRecommendationSource([session(1, [squat])], {
      name: "Machine Chest Press",
      category: "Machine",
      primaryMuscles: [{ name: "Chest" }],
    })
    expect(src.kind).toBe("none")
  })

  it("scores same pattern+muscle+equipment highest", () => {
    const a = calculateExerciseSimilarity(
      { name: "Machine Chest Press", category: "Machine", primaryMuscles: [{ name: "Chest" }] },
      { name: "Seated Chest Press Machine", category: "Machine", primaryMuscles: [{ name: "Chest" }] },
    )
    const b = calculateExerciseSimilarity(
      { name: "Machine Chest Press", category: "Machine", primaryMuscles: [{ name: "Chest" }] },
      { name: "Barbell Bench Press", category: "Free weight", primaryMuscles: [{ name: "Chest" }] },
    )
    expect(a).toBeGreaterThan(b)
  })
})

/* ── Initial prescription ──────────────────────────── */

describe("calculateInitialPrescription", () => {
  it("produces a recommendation from exact history", () => {
    const rec = calculateInitialPrescription({
      exercise: { name: "Triceps Pushdown", category: "Cable" },
      sessions: [pushdownHistory()],
    })
    expect(rec.reasonCodes).toContain("EXACT_HISTORY_FOUND")
    expect(rec.loadLb).toBe(50)
    expect(rec.action).toBe("add_reps")
    expect(rec.confidence).toBe("medium") // single exposure
  })

  it("moves to the next increment when the rep-range ceiling is reached at target RIR", () => {
    const hist = [
      session(2, [
        exercise("Lat Pulldown", [
          set(100, 12, { rir: 2 }),
          set(100, 12, { rir: 3 }),
          set(100, 12, { rir: 2 }),
        ], { category: "Cable" }),
      ]),
      session(9, [
        exercise("Lat Pulldown", [set(100, 11, { rir: 2 })], { category: "Cable" }),
      ]),
    ]
    const rec = calculateInitialPrescription({
      exercise: { name: "Lat Pulldown", category: "Cable" },
      sessions: hist,
    })
    expect(rec.action).toBe("increase_load")
    expect(rec.loadLb).toBe(105)
    expect(rec.delta).toBe("+5 lb")
    expect(rec.loadLb! % 5).toBe(0)
    expect(rec.confidence).toBe("high")
  })

  it("holds load after two below-target sessions (deload needs three)", () => {
    const hist = [
      session(2, [
        exercise("Lat Pulldown", [
          set(100, 6, { rir: 0 }),
          set(100, 5, { rir: 0 }),
          set(100, 5, { rir: 0 }),
        ], { category: "Cable" }),
      ]),
      session(9, [
        exercise("Lat Pulldown", [set(100, 6, { rir: 0 }), set(100, 5, { rir: 0 })], {
          category: "Cable",
        }),
      ]),
    ]
    const rec = calculateInitialPrescription({
      exercise: { name: "Lat Pulldown", category: "Cable" },
      sessions: hist,
    })
    expect(rec.status).toBe("hold")
    expect(rec.action).toBe("hold")
    expect(rec.loadLb).toBe(100)
  })

  it("recommends a lighter exposure after three below-target sessions", () => {
    const hist = [
      session(2, [
        exercise("Lat Pulldown", [
          set(100, 6, { rir: 0 }),
          set(100, 5, { rir: 0 }),
          set(100, 5, { rir: 0 }),
        ], { category: "Cable" }),
      ]),
      session(9, [
        exercise("Lat Pulldown", [set(100, 6, { rir: 0 }), set(100, 5, { rir: 0 })], {
          category: "Cable",
        }),
      ]),
      session(16, [
        exercise("Lat Pulldown", [set(100, 5, { rir: 0 }), set(100, 5, { rir: 0 })], {
          category: "Cable",
        }),
      ]),
    ]
    const rec = calculateInitialPrescription({
      exercise: { name: "Lat Pulldown", category: "Cable" },
      sessions: hist,
    })
    expect(rec.status).toBe("back-off")
    expect(rec.action).toBe("reduce_load")
    expect(rec.loadLb).toBe(95)
  })

  it("uses a similar movement with a disclosed source and low confidence", () => {
    const bench = exercise(
      "Barbell Bench Press",
      [set(135, 10, { rir: 2 }), set(135, 10, { rir: 2 }), set(135, 9, { rir: 2 })],
      { category: "Free weight", primaryMuscles: [{ name: "Chest" }] },
    )
    const rec = calculateInitialPrescription({
      exercise: {
        name: "Machine Chest Press",
        category: "Machine",
        primaryMuscles: [{ name: "Chest" }],
      },
      sessions: [session(1, [bench])],
    })
    expect(rec.reasonCodes).toContain("SIMILAR_EXERCISE_FALLBACK")
    expect(rec.confidence).toBe("low")
    expect(rec.sourceLabel).toContain("Barbell Bench Press")
    expect(rec.detail).toContain("calibration")
    // 135 × 0.75 = 101.25 → rounded DOWN to the 10 lb machine increment
    expect(rec.loadLb).toBe(100)
    expect(rec.status).toBe("calibration")
  })

  it("asks for a conservative load and labels calibration when no history exists", () => {
    const rec = calculateInitialPrescription({
      exercise: { name: "Machine Chest Press", category: "Machine" },
      sessions: [],
    })
    expect(rec.status).toBe("calibration")
    expect(rec.loadLb).toBeNull()
    expect(rec.reasonCodes).toContain("INSUFFICIENT_DATA")
    expect(rec.targetRir).toBeGreaterThanOrEqual(3)
  })

  it("progresses bodyweight movements through reps only", () => {
    const hist = session(3, [
      exercise("Push Up", [set(null, 15, { rir: 2 }), set(null, 13, { rir: 1 })], {
        category: "Body weight",
      }),
    ])
    const rec = calculateInitialPrescription({
      exercise: { name: "Push Up", category: "Body weight" },
      sessions: [hist],
    })
    expect(rec.reasonCodes).toContain("BODYWEIGHT_REPS_ONLY")
    expect(rec.action).toBe("add_reps")
    expect(rec.loadLb).toBeNull()
    expect(rec.headline).toContain("Bodyweight")
  })

  it("history without RIR still yields a valid but lower-confidence recommendation", () => {
    const hist = [
      session(2, [
        exercise("Triceps Pushdown", [set(50, 12), set(50, 12)], { category: "Cable" }),
      ]),
      session(9, [
        exercise("Triceps Pushdown", [set(50, 11), set(50, 11)], { category: "Cable" }),
      ]),
    ]
    const rec = calculateInitialPrescription({
      exercise: { name: "Triceps Pushdown", category: "Cable" },
      sessions: hist,
    })
    expect(rec.loadLb).toBe(50)
    expect(rec.confidence).toBe("medium")
    expect(rec.reasonCodes).toContain("RIR_MISSING")
  })
})

/* ── Per-set evaluation ────────────────────────────── */

describe("evaluateCompletedSet", () => {
  const rx = { repMin: 8, repMax: 12, targetRir: 2 }
  it("classifies range and effort", () => {
    expect(evaluateCompletedSet(set(100, 6, { rir: 0 }), rx)).toMatchObject({
      vsRange: "below",
      vsRir: "harder",
    })
    expect(evaluateCompletedSet(set(100, 10, { rir: 2 }), rx)).toMatchObject({
      vsRange: "in",
      vsRir: "on",
    })
    expect(evaluateCompletedSet(set(100, 12, { rir: 4 }), rx)).toMatchObject({
      vsRange: "above",
      vsRir: "easier",
    })
    expect(evaluateCompletedSet(set(100, 10), rx).vsRir).toBeNull()
  })
})

/* ── Live next-set recommendations ─────────────────── */

describe("calculateNextSetRecommendation", () => {
  function liveExercise(sets: PoSet[]): PoExercise {
    return exercise("Triceps Pushdown", sets, { category: "Cable" })
  }
  const sessions = [pushdownHistory()]

  it("recommends a reasonable increase after a clearly easy set", () => {
    const rec = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 13, { rir: 4 }),
        set(50, null, { completed: false }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(rec.action).toBe("increase_load")
    expect(rec.loadLb).toBe(55)
    expect(rec.loadLb! % 5).toBe(0)
    expect(rec.apply?.weight).toBe(55)
    expect(rec.reasonCodes).toContain("ABOVE_TARGET_RIR")
  })

  it("holds the load when the set lands on target", () => {
    const rec = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 11, { rir: 1 }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(rec.action).toBe("hold")
    expect(rec.loadLb).toBe(50)
    expect(rec.status).toBe("hold")
  })

  it("holds the load after one hard set (deload needs consecutive hard sets)", () => {
    const rec = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 7, { rir: 0 }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(rec.action).toBe("hold")
    expect(rec.loadLb).toBe(50)
    expect(rec.status).toBe("hold")
  })

  it("recommends a reduction after two consecutive hard sets", () => {
    const rec = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 7, { rir: 0 }),
        set(50, 6, { rir: 0 }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(rec.action).toBe("reduce_load")
    expect(rec.loadLb).toBe(45)
    expect(rec.status).toBe("back-off")
  })

  it("flags a sharp rep collapse between sets (~35%+)", () => {
    const rec = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 13, { rir: 2 }),
        set(50, 8, { rir: 1 }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(rec.reasonCodes).toContain("SHARP_REP_DECLINE")
    expect(rec.action).toBe("reduce_load")
  })

  it("does not deload on a normal fatigue drop within the set", () => {
    const rec = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 13, { rir: 2 }),
        set(50, 9, { rir: 1 }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(rec.reasonCodes).not.toContain("SHARP_REP_DECLINE")
    expect(rec.action).not.toBe("reduce_load")
  })

  it("pain flags suppress all progression", () => {
    const rec = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 13, { rir: 4, painFlag: true }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(rec.reasonCodes).toContain("PAIN_FLAGGED")
    expect(rec.action).toBe("reduce_load")
    expect(rec.status).toBe("back-off")
  })

  it("technique flags hold the load even when the set was easy", () => {
    const rec = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 13, { rir: 4, techniqueFlag: true }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(rec.reasonCodes).toContain("TECHNIQUE_FLAGGED")
    expect(rec.action).toBe("hold")
  })

  it("missing RIR still produces a valid, lower-confidence recommendation", () => {
    const rec = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 11, { rirSkipped: true }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(rec.action).toBe("hold")
    expect(rec.confidence).not.toBe("high")
    expect(rec.reasonCodes).toContain("RIR_MISSING")
  })

  it("suggests an optional set only when every safety condition passes", () => {
    const good = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 12, { rir: 2 }),
        set(50, 12, { rir: 2 }),
        set(50, 12, { rir: 3 }),
      ]),
      sessions,
    })
    expect(good.action).toBe("optional_set")
    expect(good.delta).toBe("Optional extra set")
    expect(good.apply?.addSet).toBe(true)

    const tooHard = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 12, { rir: 2 }),
        set(50, 12, { rir: 2 }),
        set(50, 12, { rir: 2 }),
      ]),
      sessions,
    })
    expect(tooHard.action).not.toBe("optional_set")

    const withPain = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 12, { rir: 3 }),
        set(50, 12, { rir: 3, painFlag: true }),
        set(50, 12, { rir: 4 }),
      ]),
      sessions,
    })
    expect(withPain.action).not.toBe("optional_set")
    expect(withPain.reasonCodes).toContain("PAIN_FLAGGED")

    const atCap = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 12, { rir: 3 }),
        set(50, 12, { rir: 3 }),
        set(50, 12, { rir: 3 }),
        set(50, 12, { rir: 3 }),
        set(50, 12, { rir: 4 }),
      ]),
      sessions,
    })
    expect(atCap.action).not.toBe("optional_set")
    expect(atCap.reasonCodes).toContain("VOLUME_CAP_REACHED")
  })

  it("editing a logged set recalculates the downstream recommendation", () => {
    const before = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 13, { rir: 4 }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    const after = calculateNextSetRecommendation({
      exercise: liveExercise([
        set(50, 6, { rir: 0 }),
        set(50, null, { completed: false }),
      ]),
      sessions,
    })
    expect(before.action).toBe("increase_load")
    /* One hard set holds the load; deload requires consecutive hard sets. */
    expect(after.action).toBe("hold")
    expect(after.loadLb).toBe(50)
  })

  it("assisted movements progress by reducing assistance", () => {
    const hist = session(3, [
      exercise(
        "Machine Assisted Pull Up",
        [set(60, 12, { rir: 3 }), set(60, 12, { rir: 3 }), set(60, 12, { rir: 2 })],
        { category: "Machine" },
      ),
    ])
    const rec = calculateInitialPrescription({
      exercise: { name: "Machine Assisted Pull Up", category: "Machine" },
      sessions: [hist],
    })
    expect(rec.action).toBe("increase_load")
    expect(rec.loadLb).toBe(50) // 60 lb assist − 10 lb = harder
    expect(rec.delta).toContain("assist")
    expect(rec.reasonCodes).toContain("ASSISTED_INVERTED")
  })
})

/* ── Movement summary ──────────────────────────────── */

describe("summarizeMovementPerformance", () => {
  it("compares against the most recent comparable session", () => {
    const recent = pushdownHistory(3) // 29 total reps at 50 lb
    const older = session(10, [
      exercise("Triceps Pushdown", [set(50, 15), set(50, 15), set(50, 15)], {
        category: "Cable",
      }),
    ])
    const current = exercise(
      "Triceps Pushdown",
      [set(50, 13, { rir: 2 }), set(50, 12, { rir: 2 }), set(50, 13, { rir: 1 })],
      { category: "Cable" },
    )
    const summary = summarizeMovementPerformance({
      exercise: current,
      sessions: [older, recent],
    })
    expect(summary.comparison?.sessionId).toBe(recent.id)
    expect(summary.comparison?.totalRepsDelta).toBe(38 - 29)
    expect(summary.outcome).toBe("progressed")
    expect(summary.totalReps).toBe(38)
    expect(summary.medianRir).toBe(2)
    expect(summary.nextSession.kind).toBe("next-session")
  })

  it("detects a load PR and marks pain-flagged sessions as adjust", () => {
    const hist = pushdownHistory(3)
    const pr = summarizeMovementPerformance({
      exercise: exercise(
        "Triceps Pushdown",
        [set(55, 11, { rir: 2 }), set(55, 10, { rir: 2 })],
        { category: "Cable" },
      ),
      sessions: [hist],
    })
    expect(pr.newBest?.kind).toBe("load")
    expect(pr.outcome).toBe("progressed")

    const flagged = summarizeMovementPerformance({
      exercise: exercise(
        "Triceps Pushdown",
        [set(50, 12, { rir: 2 }), set(50, 11, { rir: 1, painFlag: true })],
        { category: "Cable" },
      ),
      sessions: [hist],
    })
    expect(flagged.outcome).toBe("adjust")
    expect(flagged.flags.pain).toBe(true)
  })
})

/* ── Workout summary ───────────────────────────────── */

describe("summarizeWorkoutProgression", () => {
  it("counts outcomes, PRs and builds per-movement next recommendations", () => {
    const prev = session(7, [
      exercise("Triceps Pushdown", [set(50, 12, { rir: 2 }), set(50, 11, { rir: 2 })], {
        category: "Cable",
      }),
      exercise("Lat Pulldown", [set(100, 10, { rir: 2 }), set(100, 10, { rir: 2 })], {
        category: "Cable",
      }),
    ])
    const finished = session(0, [
      exercise(
        "Triceps Pushdown",
        [set(55, 10, { rir: 2 }), set(55, 10, { rir: 2 })], // load PR
        { category: "Cable" },
      ),
      exercise(
        "Lat Pulldown",
        [set(100, 10, { rir: 2 }), set(100, 10, { rir: 2 })], // matched
        { category: "Cable" },
      ),
    ])
    const data = summarizeWorkoutProgression(finished, [prev])
    expect(data.movements).toHaveLength(2)
    expect(data.exercisesProgressed).toBe(1)
    expect(data.exercisesHeld).toBe(1)
    expect(data.loadPrs).toBe(1)
    expect(data.message).toContain("1 of 2")
    expect(data.movements.every((m) => m.nextRecText.length > 0)).toBe(true)
    // Round-trips through JSON for persistence
    const parsed = JSON.parse(JSON.stringify(data))
    expect(parsed.movements).toHaveLength(2)
  })

  it("handles a workout with no comparable history (all calibration)", () => {
    const finished = session(0, [
      exercise("Brand New Movement", [set(30, 10, { rir: 3 })], { category: "Machine" }),
    ])
    const data = summarizeWorkoutProgression(finished, [])
    expect(data.movements).toHaveLength(1)
    expect(data.exercisesProgressed).toBe(1) // first exposure = baseline established
    expect(data.movements[0].nextRecText.length).toBeGreaterThan(0)
  })
})
