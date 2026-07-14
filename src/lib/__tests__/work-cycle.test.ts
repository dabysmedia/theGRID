import { describe, expect, it } from "vitest"
import { getTrackingPeriod } from "@/lib/work-cycle"

const carlosCycle = {
  enabled: true,
  anchorDate: "2026-07-15",
  length: 8,
  patternJson: '["day","day","night","night","off","off","off","off"]',
  goal: 3,
}

describe("getTrackingPeriod", () => {
  it("uses the anchor as cycle day one", () => {
    const period = getTrackingPeriod("2026-07-15", carlosCycle)
    expect(period.startDate).toBe("2026-07-15")
    expect(period.endDate).toBe("2026-07-22")
    expect(period.dayNumber).toBe(1)
    expect(period.phaseLabel).toBe("Day shift 1")
  })

  it("keeps Monday July 13 inside the prior rotation", () => {
    const period = getTrackingPeriod("2026-07-13", carlosCycle)
    expect(period.startDate).toBe("2026-07-07")
    expect(period.endDate).toBe("2026-07-14")
    expect(period.dayNumber).toBe(7)
    expect(period.phaseLabel).toBe("Off day 3")
  })

  it("handles dates before the anchor with a positive cycle index", () => {
    const period = getTrackingPeriod("2026-07-06", carlosCycle)
    expect(period.startDate).toBe("2026-06-29")
    expect(period.dayNumber).toBe(8)
    expect(period.phaseLabel).toBe("Off day 4")
  })

  it("exposes compact labels for all eight phases", () => {
    const period = getTrackingPeriod("2026-07-15", carlosCycle)
    expect(period.labels).toEqual(["D1", "D2", "N1", "N2", "O1", "O2", "O3", "O4"])
    expect(period.nextStartDate).toBe("2026-07-23")
  })

  it("falls back to a Monday through Sunday calendar week", () => {
    const period = getTrackingPeriod("2026-07-14", { enabled: false, goal: 3 })
    expect(period.startDate).toBe("2026-07-13")
    expect(period.endDate).toBe("2026-07-19")
    expect(period.dayNumber).toBe(2)
    expect(period.mode).toBe("calendar")
  })
})
