import { describe, expect, it } from "vitest"
import {
  WEIGHT_AVG_WINDOW_DAYS,
  buildWeightTrendSeries,
  resolveRecordLow,
  shouldUpdateStoredRecordLow,
  sliceTrendRange,
  sparklineAverages,
  summarizeWeightTrend,
} from "@/lib/weight-trend"

describe("resolveRecordLow", () => {
  it("keeps a stored low even when that log is no longer in the series", () => {
    expect(
      resolveRecordLow(
        [
          { date: "2026-08-01", value: 182.4 },
          { date: "2026-08-08", value: 181.1 },
        ],
        { value: 176.2, date: "2026-03-12" },
      ),
    ).toEqual({ value: 176.2, date: "2026-03-12" })
  })

  it("replaces the stored low when a newer weigh-in undercuts it", () => {
    expect(
      resolveRecordLow(
        [{ date: "2026-08-10", value: 175.4 }],
        { value: 176.2, date: "2026-03-12" },
      ),
    ).toEqual({ value: 175.4, date: "2026-08-10" })
  })

  it("uses the lowest log when nothing is stored yet", () => {
    expect(
      resolveRecordLow(
        [
          { date: "2026-08-01", value: 180 },
          { date: "2026-08-03", value: 178.6 },
          { date: "2026-08-02", value: 179.2 },
        ],
        null,
      ),
    ).toEqual({ value: 178.6, date: "2026-08-03" })
  })
})

describe("shouldUpdateStoredRecordLow", () => {
  it("writes the first log and only then a strictly lower one", () => {
    expect(
      shouldUpdateStoredRecordLow(null, { date: "2026-08-01", value: 180 }),
    ).toBe(true)
    expect(
      shouldUpdateStoredRecordLow(
        { value: 180, date: "2026-08-01" },
        { date: "2026-08-02", value: 180 },
      ),
    ).toBe(false)
    expect(
      shouldUpdateStoredRecordLow(
        { value: 180, date: "2026-08-01" },
        { date: "2026-08-03", value: 179.4 },
      ),
    ).toBe(true)
  })
})

describe("buildWeightTrendSeries", () => {
  it("plots trailing averages instead of the raw daily weigh-in", () => {
    const points = buildWeightTrendSeries([
      { date: "2026-08-01", value: 180 },
      { date: "2026-08-02", value: 178 },
      { date: "2026-08-03", value: 176 },
    ])

    expect(points).toHaveLength(3)
    expect(points[0]).toMatchObject({ date: "2026-08-01", raw: 180, average: 180 })
    expect(points[1]).toMatchObject({ date: "2026-08-02", raw: 178, average: 179 })
    expect(points[2]).toMatchObject({ date: "2026-08-03", raw: 176, average: 178 })
  })

  it("keeps the average moving on days without a weigh-in", () => {
    const points = buildWeightTrendSeries([
      { date: "2026-08-01", value: 180 },
      { date: "2026-08-04", value: 174 },
    ])

    expect(points.map((point) => point.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ])
    expect(points[1]).toMatchObject({ raw: null, average: 180 })
    expect(points[3]).toMatchObject({ raw: 174, average: 177 })
  })

  it("drops vacation-blocked days from both the line and the window", () => {
    const points = buildWeightTrendSeries(
      [
        { date: "2026-08-01", value: 180 },
        { date: "2026-08-02", value: 170 },
        { date: "2026-08-03", value: 179 },
      ],
      { vacationResumeDate: "2026-08-03" },
    )

    expect(points.map((point) => point.date)).toEqual(["2026-08-03"])
    expect(points[0]).toMatchObject({ raw: 179, average: 179 })
  })
})

describe("summarizeWeightTrend", () => {
  it("flags a losing average independently of the saved all-time low", () => {
    const logs = [
      { date: "2026-08-01", value: 185 },
      { date: "2026-08-08", value: 182 },
    ]
    const points = buildWeightTrendSeries(logs)
    const insight = summarizeWeightTrend(
      points,
      { value: 176.2, date: "2026-03-12" },
      logs[1]!,
    )

    expect(insight.currentAverage).toBe(183.5)
    expect(insight.previousAverage).toBe(185)
    expect(insight.vsPreviousLb).toBe(-1.5)
    expect(insight.direction).toBe("losing")
    expect(insight.recordLow).toBe(176.2)
    expect(insight.recordLowIsLatest).toBe(false)
  })

  it("marks when the latest weigh-in is the all-time low", () => {
    const logs = [
      { date: "2026-08-01", value: 180 },
      { date: "2026-08-08", value: 176.2 },
    ]
    const points = buildWeightTrendSeries(logs)
    const insight = summarizeWeightTrend(
      points,
      { value: 176.2, date: "2026-08-08" },
      logs[1]!,
    )
    expect(insight.recordLowIsLatest).toBe(true)
  })
})

describe("sparklineAverages / sliceTrendRange", () => {
  it("returns the last window of averages and can clip to a range", () => {
    const points = buildWeightTrendSeries([
      { date: "2026-08-01", value: 180 },
      { date: "2026-08-10", value: 174 },
    ])
    expect(sparklineAverages(points, WEIGHT_AVG_WINDOW_DAYS, "2026-08-10")).toHaveLength(7)
    expect(sliceTrendRange(points, 3, "2026-08-10").map((point) => point.date)).toEqual([
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ])
  })
})
