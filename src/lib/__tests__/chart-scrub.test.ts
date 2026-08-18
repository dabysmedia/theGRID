import { describe, expect, it } from "vitest"
import {
  hourlyValueRanges,
  interpolateSeries,
  interpolateSparseByIndex,
  nearestDefinedIndex,
  nearestSeriesPoint,
  plotRatioFromView,
  ratioToTime,
} from "@/lib/chart-scrub"
import { zoneForBpm, zoneLegend } from "@/lib/heart-rate-zones"

describe("interpolateSeries", () => {
  const points = [
    { t: 0, v: 60 },
    { t: 10, v: 80 },
    { t: 20, v: 70 },
  ]

  it("moves smoothly between samples instead of snapping", () => {
    expect(interpolateSeries(points, 5)?.v).toBe(70)
    expect(interpolateSeries(points, 15)?.v).toBe(75)
  })

  it("clamps to the ends of the series", () => {
    expect(interpolateSeries(points, -4)?.v).toBe(60)
    expect(interpolateSeries(points, 40)?.v).toBe(70)
  })
})

describe("interpolateSparseByIndex", () => {
  it("bridges calendar gaps so scrubbing does not jump", () => {
    const values = [40, null, null, 70]
    expect(interpolateSparseByIndex(values, 0)).toBe(40)
    expect(interpolateSparseByIndex(values, 1.5)).toBe(55)
    expect(interpolateSparseByIndex(values, 3)).toBe(70)
  })
})

describe("ratioToTime / hourlyValueRanges", () => {
  it("maps a scrub ratio across the window", () => {
    expect(ratioToTime(100, 200, 0.25)).toBe(125)
  })

  it("rolls samples into local-hour min/max bands", () => {
    const start = new Date("2026-08-14T10:05:00").getTime()
    const ranges = hourlyValueRanges([
      { t: start, v: 80 },
      { t: start + 10 * 60 * 1000, v: 92 },
      { t: start + 70 * 60 * 1000, v: 110 },
    ])
    expect(ranges).toHaveLength(2)
    expect(ranges[0]).toMatchObject({ min: 80, max: 92 })
    expect(ranges[1]).toMatchObject({ min: 110, max: 110 })
  })
})

describe("zoneForBpm", () => {
  it("uses supplied thresholds when present", () => {
    const zone = zoneForBpm(155, [
      { zone: "FAT_BURN", minBpm: 100, maxBpm: 140 },
      { zone: "CARDIO", minBpm: 140, maxBpm: 170 },
    ])
    expect(zone.key).toBe("CARDIO")
    expect(zone.label).toBe("Zone 3")
    expect(zone.number).toBe(3)
  })

  it("maps Google fat-burn to Zone 1", () => {
    const zone = zoneForBpm(120, [
      { zone: "OUT_OF_RANGE", minBpm: 0, maxBpm: 110 },
      { zone: "FAT_BURN", minBpm: 110, maxBpm: 140 },
    ])
    expect(zone.label).toBe("Zone 1")
    expect(zone.number).toBe(1)
  })
})

describe("nearestDefinedIndex / nearestSeriesPoint", () => {
  it("keeps the actual nightly HRV instead of blending across gaps", () => {
    const values = [40, null, null, 70]
    expect(nearestDefinedIndex(values, 1.5)).toBe(0)
    expect(values[nearestDefinedIndex(values, 1.5)!]).toBe(40)
    expect(nearestDefinedIndex(values, 2.2)).toBe(3)
  })

  it("snaps to the nearest recorded sample", () => {
    const points = [
      { t: 0, v: 60 },
      { t: 10, v: 80 },
    ]
    expect(nearestSeriesPoint(points, 3)).toEqual({ t: 0, v: 60 })
    expect(nearestSeriesPoint(points, 8)).toEqual({ t: 10, v: 80 })
  })
})

describe("plotRatioFromView", () => {
  it("maps the inner plot so padding does not steal the first/last sample", () => {
    expect(plotRatioFromView(0, 8, 992, 1000)).toBe(0)
    expect(plotRatioFromView(8 / 1000, 8, 992, 1000)).toBe(0)
    expect(plotRatioFromView(992 / 1000, 8, 992, 1000)).toBe(1)
    expect(plotRatioFromView(0.5, 8, 992, 1000)).toBeCloseTo((500 - 8) / 984)
  })
})

describe("zoneLegend", () => {
  it("lists training zones and never Fat burn", () => {
    const legend = zoneLegend([
      { zone: "OUT_OF_RANGE", minBpm: 0, maxBpm: 110 },
      { zone: "FAT_BURN", minBpm: 110, maxBpm: 140 },
      { zone: "CARDIO", minBpm: 140, maxBpm: 170 },
      { zone: "PEAK", minBpm: 170, maxBpm: 220 },
    ])
    expect(legend.map((zone) => zone.label)).toEqual(["Zone 1", "Zone 3", "Zone 5"])
  })
})
