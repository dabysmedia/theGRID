import { describe, expect, it } from "vitest"
import {
  circulatingCurvePoints,
  countDosedWeeks,
  daysElapsedSince,
  estimateCirculatingMg,
  formatEstimateMg,
  injectionWeekKey,
  remainingDoseMg,
} from "@/lib/peptides"

describe("injectionWeekKey", () => {
  it("uses Monday as week start", () => {
    // Wednesday 2026-07-08 local → week of Monday 2026-07-06
    expect(injectionWeekKey("2026-07-08T15:00:00")).toBe("2026-07-06")
    // Sunday 2026-07-12 still in same week
    expect(injectionWeekKey("2026-07-12T10:00:00")).toBe("2026-07-06")
    // Next Monday starts a new week
    expect(injectionWeekKey("2026-07-13T08:00:00")).toBe("2026-07-13")
  })
})

describe("countDosedWeeks", () => {
  it("returns 0 for empty history", () => {
    expect(countDosedWeeks([])).toBe(0)
  })

  it("counts distinct weeks with ≥1 dose", () => {
    expect(
      countDosedWeeks([
        { injectedAt: "2026-07-08T12:00:00" }, // week of Jul 6
        { injectedAt: "2026-07-10T12:00:00" }, // same week
        { injectedAt: "2026-06-30T12:00:00" }, // week of Jun 29
        { injectedAt: "2026-06-15T12:00:00" }, // week of Jun 15
      ]),
    ).toBe(3)
  })

  it("does not inflate for multiple doses in one week", () => {
    expect(
      countDosedWeeks([
        { injectedAt: "2026-07-06T09:00:00" },
        { injectedAt: "2026-07-08T09:00:00" },
        { injectedAt: "2026-07-12T09:00:00" },
      ]),
    ).toBe(1)
  })
})

describe("half-life decay", () => {
  it("halves after one half-life", () => {
    expect(remainingDoseMg(8, 6)).toBeCloseTo(4, 6)
  })

  it("quarters after two half-lives", () => {
    expect(remainingDoseMg(8, 12)).toBeCloseTo(2, 6)
  })

  it("superposes multiple shots", () => {
    const now = Date.parse("2026-07-10T12:00:00")
    const mg = estimateCirculatingMg(
      [
        { injectedAt: "2026-07-10T12:00:00", doseMg: 4 }, // just now → 4
        { injectedAt: "2026-07-04T12:00:00", doseMg: 4 }, // 6d ago → 2
      ],
      now,
    )
    expect(mg).toBeCloseTo(6, 5)
  })

  it("daysElapsedSince is fractional", () => {
    const now = Date.parse("2026-07-10T18:00:00")
    expect(daysElapsedSince("2026-07-10T12:00:00", now)).toBeCloseTo(0.25, 5)
  })

  it("formatEstimateMg stays compact", () => {
    expect(formatEstimateMg(0)).toBe("0")
    expect(formatEstimateMg(0.02)).toBe("<0.1")
    expect(formatEstimateMg(3.14)).toBe("3.1")
  })

  it("curve includes a now point near dayOffset 0", () => {
    const now = Date.parse("2026-07-10T12:00:00")
    const pts = circulatingCurvePoints(
      [{ injectedAt: "2026-07-10T12:00:00", doseMg: 4 }],
      { nowMs: now, fromDaysAgo: 0, toDaysAhead: 6, steps: 6 },
    )
    expect(pts[0]?.dayOffset).toBe(0)
    expect(pts[0]?.mg).toBeCloseTo(4, 5)
    expect(pts[pts.length - 1]?.mg).toBeCloseTo(2, 5)
  })
})
