import { describe, expect, it } from "vitest"
import {
  INTAKE_FLOOR_KCAL,
  KCAL_PER_LB,
  averageCompleteIntake,
  classifyIntakeDays,
  computeRateSet,
  computeWeightRate,
  currentTrendWeight,
  estimateExpenditure,
  projectWeight,
  summarizeActivity,
  type IntakeDayInput,
} from "@/lib/weight-projection"
import { addDaysToYmd } from "@/lib/steps-day"
import { buildWeightTrendSeries } from "@/lib/weight-trend"

/** Weigh-ins falling at a constant rate from `start`, one per day. */
function fallingLogs(start: string, days: number, from: number, lbPerDay: number) {
  return Array.from({ length: days }, (_, i) => ({
    date: addDaysToYmd(start, i),
    value: from + lbPerDay * i,
  }))
}

function intakeDays(start: string, days: number, kcal: number): IntakeDayInput[] {
  return Array.from({ length: days }, (_, i) => ({
    date: addDaysToYmd(start, i),
    kcal,
    entries: 4,
  }))
}

describe("classifyIntakeDays", () => {
  const from = "2026-08-01"
  const to = "2026-08-10"

  it("keeps fully logged days and drops untracked ones", () => {
    const coverage = classifyIntakeDays(
      [
        { date: "2026-08-01", kcal: 2200, entries: 5 },
        { date: "2026-08-02", kcal: 2400, entries: 4 },
      ],
      { from, to, today: "2026-08-11" },
    )
    expect(coverage.completeDays).toBe(2)
    expect(coverage.untrackedDays).toBe(8)
    expect(coverage.avgKcal).toBe(2300)
    expect(coverage.days.find((d) => d.date === "2026-08-05")?.quality).toBe("untracked")
  })

  it("flags a day logged well under the user's own typical day as partial", () => {
    const days: IntakeDayInput[] = [
      ...intakeDays("2026-08-01", 9, 2600),
      { date: "2026-08-10", kcal: 900, entries: 1 },
    ]
    const coverage = classifyIntakeDays(days, { from, to, today: "2026-08-11" })
    expect(coverage.days.find((d) => d.date === "2026-08-10")?.quality).toBe("partial")
    expect(coverage.completeDays).toBe(9)
    expect(coverage.avgKcal).toBe(2600)
  })

  it("uses the absolute floor when the typical day is small", () => {
    const coverage = classifyIntakeDays(
      [
        { date: "2026-08-01", kcal: INTAKE_FLOOR_KCAL + 50, entries: 3 },
        { date: "2026-08-02", kcal: INTAKE_FLOOR_KCAL - 50, entries: 1 },
      ],
      { from, to, today: "2026-08-11" },
    )
    expect(coverage.days.find((d) => d.date === "2026-08-01")?.quality).toBe("complete")
    expect(coverage.days.find((d) => d.date === "2026-08-02")?.quality).toBe("partial")
  })

  it("excludes today and vacation days rather than counting them as misses", () => {
    const coverage = classifyIntakeDays(intakeDays("2026-08-01", 4, 2500), {
      from,
      to,
      today: "2026-08-09",
      vacationResumeDate: "2026-08-03",
    })
    // 08-01 and 08-02 are vacation; 08-09 and 08-10 are today/future.
    expect(coverage.excludedDays).toBe(4)
    expect(coverage.eligibleDays).toBe(6)
    expect(coverage.completeDays).toBe(2)
  })

  it("sums multiple rows for the same day", () => {
    const coverage = classifyIntakeDays(
      [
        { date: "2026-08-01", kcal: 1200, entries: 2 },
        { date: "2026-08-01", kcal: 1100, entries: 2 },
      ],
      { from, to, today: "2026-08-11" },
    )
    expect(coverage.days.find((d) => d.date === "2026-08-01")).toMatchObject({
      kcal: 2300,
      entries: 4,
      quality: "complete",
    })
  })
})

describe("averageCompleteIntake", () => {
  it("averages only the complete days inside the trailing window", () => {
    const coverage = classifyIntakeDays(
      [
        ...intakeDays("2026-08-01", 3, 3000),
        ...intakeDays("2026-08-04", 4, 2000),
        { date: "2026-08-08", kcal: 400, entries: 1 },
      ],
      { from: "2026-08-01", to: "2026-08-10", today: "2026-08-11" },
    )
    expect(averageCompleteIntake(coverage, 7, "2026-08-10")).toEqual({
      avgKcal: 2000,
      completeDays: 4,
    })
  })
})

describe("computeWeightRate", () => {
  it("recovers a clean linear rate", () => {
    const logs = fallingLogs("2026-07-14", 28, 210, -0.15)
    const rate = computeWeightRate(logs, 28, "2026-08-10")
    expect(rate).not.toBeNull()
    expect(rate!.lbPerDay).toBeCloseTo(-0.15, 4)
    expect(rate!.lbPerWeek).toBeCloseTo(-1.05, 2)
    expect(rate!.samples).toBe(28)
    expect(rate!.r2).toBe(1)
  })

  it("fits the end of the window, not the lagging average", () => {
    const logs = fallingLogs("2026-07-14", 28, 210, -0.15)
    const rate = computeWeightRate(logs, 28, "2026-08-10")!
    // fitEnd is rounded to a tenth, so allow that much slack.
    expect(Math.abs(rate.fitEnd - (210 - 0.15 * 27))).toBeLessThan(0.051)
  })

  it("returns null with fewer than three weigh-ins", () => {
    expect(
      computeWeightRate(
        [
          { date: "2026-08-01", value: 210 },
          { date: "2026-08-08", value: 208 },
        ],
        28,
        "2026-08-10",
      ),
    ).toBeNull()
  })

  it("returns null when the weigh-ins are bunched into too short a span", () => {
    expect(
      computeWeightRate(
        [
          { date: "2026-08-08", value: 210 },
          { date: "2026-08-09", value: 209.6 },
          { date: "2026-08-10", value: 209.4 },
        ],
        30,
        "2026-08-10",
      ),
    ).toBeNull()
  })

  it("ignores weigh-ins outside the window and on vacation days", () => {
    const logs = [
      { date: "2026-06-01", value: 240 },
      ...fallingLogs("2026-08-01", 10, 200, -0.2),
    ]
    const rate = computeWeightRate(logs, 14, "2026-08-10", {
      vacationResumeDate: "2026-08-03",
    })!
    expect(rate.samples).toBe(8)
    expect(rate.lbPerWeek).toBeCloseTo(-1.4, 2)
  })

  it("computes a set of windows at once", () => {
    const logs = fallingLogs("2026-06-01", 80, 220, -0.1)
    const set = computeRateSet(logs, "2026-08-19", [7, 30, 90])
    expect(set[7]!.lbPerWeek).toBeCloseTo(-0.7, 2)
    expect(set[30]!.lbPerWeek).toBeCloseTo(-0.7, 2)
    expect(set[90]!.lbPerWeek).toBeCloseTo(-0.7, 2)
  })
})

describe("summarizeActivity", () => {
  it("prices the recent step delta against the baseline window", () => {
    const days = [
      ...Array.from({ length: 21 }, (_, i) => ({
        date: addDaysToYmd("2026-07-14", i),
        steps: 8000,
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        date: addDaysToYmd("2026-08-04", i),
        steps: 12000,
      })),
    ]
    const activity = summarizeActivity(days, {
      windowDays: 28,
      endDate: "2026-08-10",
      bodyWeightLb: 200,
    })
    expect(activity.avgSteps).toBe(9000)
    expect(activity.recentAvgSteps).toBe(12000)
    // 3000 extra steps x 0.00017 x 200 lb = ~102 kcal
    expect(activity.deltaKcal).toBe(102)
  })

  it("reports a zero delta when there is no step data", () => {
    expect(
      summarizeActivity([], { windowDays: 28, endDate: "2026-08-10", bodyWeightLb: 200 }),
    ).toMatchObject({ avgSteps: null, deltaKcal: 0 })
  })
})

describe("estimateExpenditure", () => {
  const endDate = "2026-08-10"
  const windowStart = addDaysToYmd(endDate, -27)

  function setup(kcal: number, lbPerDay: number) {
    const coverage = classifyIntakeDays(intakeDays(windowStart, 28, kcal), {
      from: windowStart,
      to: endDate,
      today: addDaysToYmd(endDate, 1),
    })
    const rate = computeWeightRate(fallingLogs(windowStart, 28, 210, lbPerDay), 28, endDate)!
    return { coverage, rate }
  }

  it("adds the energy the scale says came out of storage", () => {
    // 2,200 kcal/day while losing 1 lb/week => ~2,700 kcal/day burned.
    const { coverage, rate } = setup(2200, -1 / 7)
    const estimate = estimateExpenditure({ coverage, rate, endDate })!
    expect(estimate.avgIntakeKcal).toBe(2200)
    expect(estimate.trendDeficitKcal).toBe(Math.round((KCAL_PER_LB * 1) / 7))
    expect(estimate.expenditureKcal).toBe(2200 + 500)
    expect(estimate.currentDeficitKcal).toBe(500)
    expect(estimate.projectedLbPerWeek).toBeCloseTo(1, 1)
  })

  it("reports a surplus as a negative deficit when weight is climbing", () => {
    const { coverage, rate } = setup(3000, 1 / 7)
    const estimate = estimateExpenditure({ coverage, rate, endDate })!
    expect(estimate.expenditureKcal).toBe(3000 - 500)
    expect(estimate.currentDeficitKcal).toBe(-500)
  })

  it("nudges maintenance by how active the last week has been", () => {
    const { coverage, rate } = setup(2200, -1 / 7)
    const estimate = estimateExpenditure({
      coverage,
      rate,
      endDate,
      activity: {
        windowDays: 28,
        avgSteps: 8000,
        recentAvgSteps: 11000,
        avgCardioKcal: null,
        recentAvgCardioKcal: null,
        deltaKcal: 120,
      },
    })!
    expect(estimate.expenditureKcal).toBe(2700)
    expect(estimate.expenditureNowKcal).toBe(2820)
    expect(estimate.currentDeficitKcal).toBe(620)
  })

  it("does not let partial or untracked days drag the intake average down", () => {
    const days: IntakeDayInput[] = [
      ...intakeDays(windowStart, 20, 2200),
      // five days where only a snack got logged, three logged not at all
      ...Array.from({ length: 5 }, (_, i) => ({
        date: addDaysToYmd(windowStart, 20 + i),
        kcal: 350,
        entries: 1,
      })),
    ]
    const coverage = classifyIntakeDays(days, {
      from: windowStart,
      to: endDate,
      today: addDaysToYmd(endDate, 1),
    })
    const rate = computeWeightRate(fallingLogs(windowStart, 28, 210, -1 / 7), 28, endDate)!
    const estimate = estimateExpenditure({ coverage, rate, endDate })!
    expect(estimate.avgIntakeKcal).toBe(2200)
    expect(estimate.partialDaysIgnored).toBe(5)
    expect(estimate.untrackedDaysIgnored).toBe(3)
    expect(estimate.completeDays).toBe(20)
    expect(estimate.expenditureKcal).toBe(2700)
  })

  it("withholds an estimate when too few days were logged cleanly", () => {
    const coverage = classifyIntakeDays(intakeDays(windowStart, 5, 2200), {
      from: windowStart,
      to: endDate,
      today: addDaysToYmd(endDate, 1),
    })
    const rate = computeWeightRate(fallingLogs(windowStart, 28, 210, -1 / 7), 28, endDate)!
    expect(estimateExpenditure({ coverage, rate, endDate })).toBeNull()
  })

  it("downgrades confidence as coverage falls", () => {
    const { coverage, rate } = setup(2200, -1 / 7)
    expect(estimateExpenditure({ coverage, rate, endDate })!.confidence).toBe("high")

    const sparse = classifyIntakeDays(intakeDays(windowStart, 12, 2200), {
      from: windowStart,
      to: endDate,
      today: addDaysToYmd(endDate, 1),
    })
    expect(estimateExpenditure({ coverage: sparse, rate, endDate })!.confidence).toBe("low")
  })
})

describe("projectWeight", () => {
  it("dates the arrival at the goal weight", () => {
    const projection = projectWeight({
      startDate: "2026-08-10",
      startWeight: 210,
      lbPerWeek: -1,
      targetLb: 200,
    })
    expect(projection.reachable).toBe(true)
    expect(projection.daysToTarget).toBe(70)
    expect(projection.etaDate).toBe("2026-10-19")
    expect(projection.weeksToTarget).toBe(10)
    expect(projection.remainingLb).toBe(10)
    expect(projection.points[0]).toMatchObject({ date: "2026-08-10", projected: 210 })
    expect(projection.points[projection.points.length - 1]!.projected).toBeCloseTo(200, 1)
  })

  it("gives no ETA when the trend is flat", () => {
    const projection = projectWeight({
      startDate: "2026-08-10",
      startWeight: 210,
      lbPerWeek: -0.02,
      targetLb: 200,
    })
    expect(projection.reachable).toBe(false)
    expect(projection.blockedReason).toBe("flat")
    expect(projection.etaDate).toBeNull()
  })

  it("gives no ETA when the trend runs away from the target", () => {
    const projection = projectWeight({
      startDate: "2026-08-10",
      startWeight: 210,
      lbPerWeek: 0.8,
      targetLb: 200,
    })
    expect(projection.blockedReason).toBe("wrong-direction")
    expect(projection.points.length).toBeGreaterThan(1)
  })

  it("still draws a horizon when no goal weight is set", () => {
    const projection = projectWeight({
      startDate: "2026-08-10",
      startWeight: 210,
      lbPerWeek: -1,
      targetLb: null,
      fallbackDays: 84,
    })
    expect(projection.blockedReason).toBe("no-target")
    expect(projection.points[projection.points.length - 1]!.date).toBe("2026-11-02")
    expect(projection.points[projection.points.length - 1]!.projected).toBeCloseTo(198, 1)
  })

  it("refuses a goal that is more than two years out", () => {
    const projection = projectWeight({
      startDate: "2026-08-10",
      startWeight: 300,
      lbPerWeek: -0.1,
      targetLb: 200,
    })
    expect(projection.blockedReason).toBe("too-far")
    expect(projection.etaDate).toBeNull()
  })
})

describe("currentTrendWeight", () => {
  it("returns the latest smoothed value at or before the cutoff", () => {
    const points = buildWeightTrendSeries(fallingLogs("2026-08-01", 10, 210, -0.2))
    expect(currentTrendWeight(points, "2026-08-05")).toMatchObject({ date: "2026-08-05" })
    expect(currentTrendWeight(points, "2026-07-01")).toBeNull()
  })
})
