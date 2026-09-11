import { describe, expect, it } from "vitest"
import {
  calculateInitialPrescription,
  compareCompletedSets,
  getComparableExerciseHistory,
  planSessionSets,
  selectRecommendationSource,
  summarizeMovementPerformance,
  type PoExercise,
  type PoSession,
  type PoSet,
} from "../progressive-overload"

/* ── Fixtures ──────────────────────────────────────── */

let counter = 0
const uid = () => `id${++counter}`

function set(weight: number | null, reps: number | null, extra?: Partial<PoSet>): PoSet {
  return { id: uid(), setNumber: 0, weight, reps, type: "working", completed: true, ...extra }
}

function exercise(name: string, sets: PoSet[], extra?: Partial<PoExercise>): PoExercise {
  return {
    id: uid(),
    name,
    sets: sets.map((s, i) => ({ ...s, setNumber: i + 1 })),
    ...extra,
  }
}

function session(daysAgo: number, exercises: PoExercise[]): PoSession {
  const when = new Date(Date.now() - daysAgo * 86_400_000)
  return {
    id: uid(),
    date: when.toISOString(),
    startedAt: when.toISOString(),
    finishedAt: when.toISOString(),
    status: "completed",
    exercises,
  }
}

/** 100 lb on Arsenal, 80 lb on Hammer Strength — same movement, different stacks. */
function twoMachineHistory(): PoSession[] {
  return [
    session(1, [
      exercise("Pec Deck", [set(100, 10, { rir: 2 }), set(100, 10, { rir: 2 })], {
        category: "Machine",
        machineId: "arsenal",
      }),
    ]),
    session(2, [
      exercise("Pec Deck", [set(80, 10, { rir: 2 }), set(80, 10, { rir: 2 })], {
        category: "Machine",
        machineId: "hammer",
      }),
    ]),
  ]
}

/* ── History scoping ───────────────────────────────── */

describe("machine-scoped history", () => {
  const sessions = twoMachineHistory()

  it("returns only the exposures logged on the requested machine", () => {
    expect(
      getComparableExerciseHistory(sessions, "Pec Deck", { machineId: "arsenal" })[0].workingWeight,
    ).toBe(100)
    expect(
      getComparableExerciseHistory(sessions, "Pec Deck", { machineId: "hammer" })[0].workingWeight,
    ).toBe(80)
  })

  it("searches every machine when no machine is specified (export/agent behaviour)", () => {
    expect(getComparableExerciseHistory(sessions, "Pec Deck")).toHaveLength(2)
  })

  it("treats an explicit null as the no-machine bucket", () => {
    expect(getComparableExerciseHistory(sessions, "Pec Deck", { machineId: null })).toHaveLength(0)
  })

  it("keeps pre-machine-mode history working unchanged", () => {
    const legacy = [
      session(1, [
        exercise("Lat Pulldown", [set(60, 10, { rir: 2 })], { category: "Machine" }),
      ]),
    ]
    expect(
      getComparableExerciseHistory(legacy, "Lat Pulldown", { machineId: null }),
    ).toHaveLength(1)
    expect(
      selectRecommendationSource(legacy, { name: "Lat Pulldown", category: "Machine" }).kind,
    ).toBe("exact")
  })
})

/* ── Recommendation sourcing ───────────────────────── */

describe("selectRecommendationSource with machines", () => {
  const sessions = twoMachineHistory()

  it("uses exact history when the machine matches", () => {
    const source = selectRecommendationSource(sessions, {
      name: "Pec Deck",
      category: "Machine",
      machineId: "arsenal",
    })
    expect(source.kind).toBe("exact")
    expect(source.exposures[0].workingWeight).toBe(100)
  })

  it("offers a transfer estimate for a machine with no history yet", () => {
    const source = selectRecommendationSource(sessions, {
      name: "Pec Deck",
      category: "Machine",
      machineId: "prime",
    })
    expect(source.kind).toBe("machine-transfer")
    expect(source.loadRatio).toBe(0.75)
    expect(source.sourceMachineLabel).toBe("Arsenal Strength")
  })

  it("does not invent a source when there is no history at all", () => {
    expect(
      selectRecommendationSource(sessions, {
        name: "Pec Deck",
        category: "Machine",
        machineId: null,
      }).kind,
    ).toBe("none")
  })
})

describe("calculateInitialPrescription on a new machine", () => {
  it("labels the estimate as a machine change, not a drop in strength", () => {
    const rec = calculateInitialPrescription({
      exercise: { name: "Pec Deck", category: "Machine", machineId: "prime" },
      sessions: twoMachineHistory(),
    })
    expect(rec.reasonCodes).toContain("MACHINE_TRANSFER_ESTIMATE")
    /* 100 lb on Arsenal × 0.75, rounded down to the machine's 10 lb step. */
    expect(rec.loadLb).toBe(70)
    expect(rec.sourceLabel).toMatch(/Arsenal Strength/)
    expect(rec.explanation.join(" ")).toMatch(/not lost strength/i)
  })
})

/* ── Prefill isolation ─────────────────────────────── */

describe("planSessionSets per machine", () => {
  it("prefills each machine from its own numbers", () => {
    const sessions = twoMachineHistory()
    const arsenal = planSessionSets({
      exercise: { name: "Pec Deck", category: "Machine", machineId: "arsenal" },
      sessions,
      setCount: 3,
    })
    const hammer = planSessionSets({
      exercise: { name: "Pec Deck", category: "Machine", machineId: "hammer" },
      sessions,
      setCount: 3,
    })
    expect(arsenal.sets[0].weight).toBe(100)
    expect(hammer.sets[0].weight).toBe(80)
  })
})

/* ── Performance comparison isolation ──────────────── */

describe("a machine change is not a regression or a PR", () => {
  it("starts a fresh baseline on a machine you have not logged", () => {
    const current = exercise("Pec Deck", [set(70, 10, { rir: 2 }), set(70, 9, { rir: 2 })], {
      category: "Machine",
      machineId: "prime",
    })
    const summary = summarizeMovementPerformance({
      exercise: current,
      sessions: twoMachineHistory(),
    })
    expect(summary.comparison).toBeNull()
    expect(summary.newBest).toBeNull()
    expect(summary.outcome).toBe("progressed")
  })

  it("compares within the same machine", () => {
    const current = exercise("Pec Deck", [set(100, 11, { rir: 2 }), set(100, 10, { rir: 2 })], {
      category: "Machine",
      machineId: "arsenal",
    })
    const summary = summarizeMovementPerformance({
      exercise: current,
      sessions: twoMachineHistory(),
    })
    expect(summary.comparison).not.toBeNull()
    expect(summary.comparison?.sameLoad).toBe(true)
  })
})

describe("compareCompletedSets per machine", () => {
  it("shows a baseline rather than a deluge of red on a new machine", () => {
    const current = exercise("Pec Deck", [set(70, 10, { rir: 2 })], {
      category: "Machine",
      machineId: "prime",
    })
    const comparisons = compareCompletedSets({
      exercise: current,
      sessions: twoMachineHistory(),
    })
    expect(comparisons).toHaveLength(1)
    expect(comparisons[0].outcome).toBe("baseline")
  })

  it("compares set-to-set on the same machine", () => {
    const current = exercise("Pec Deck", [set(100, 11, { rir: 2 })], {
      category: "Machine",
      machineId: "arsenal",
    })
    const comparisons = compareCompletedSets({
      exercise: current,
      sessions: twoMachineHistory(),
    })
    expect(comparisons[0].outcome).toBe("progressed")
    expect(comparisons[0].label).toBe("+1 rep")
  })
})
