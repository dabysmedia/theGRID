import { describe, expect, it } from "vitest"
import {
  minutesInZones,
  remapGoogleZoneMinutes,
  standardHeartRateThresholds,
  zoneForBpm,
  zoneLegend,
} from "@/lib/heart-rate-zones"

describe("standardHeartRateThresholds", () => {
  it("puts Fitbit fat-burn / easy work in Zone 1, not Zone 2", () => {
    const thresholds = standardHeartRateThresholds({
      ageYears: 27,
      restingHeartRate: 56,
    })
    // 120 bpm is ~47% HRR — Fitbit moderate/fat-burn, classic Zone 1.
    expect(zoneForBpm(120, thresholds).label).toBe("Zone 1")
    expect(zoneForBpm(100, thresholds).label).toBe("Rest")
    expect(zoneForBpm(145, thresholds).label).toBe("Zone 2")
    expect(zoneLegend(thresholds).map((zone) => zone.label)).toEqual([
      "Zone 1",
      "Zone 2",
      "Zone 3",
      "Zone 4",
      "Zone 5",
    ])
  })
})

describe("remapGoogleZoneMinutes", () => {
  it("relabels fat-burn minutes as Zone 1 and drops below-zone rest", () => {
    const rows = remapGoogleZoneMinutes([
      { zone: "OUT_OF_RANGE", minutes: 400 },
      { zone: "FAT_BURN", minutes: 42 },
      { zone: "CARDIO", minutes: 18 },
      { zone: "PEAK", minutes: 3 },
    ])
    expect(rows).toEqual([
      { zone: "ZONE_1", minutes: 42 },
      { zone: "ZONE_3", minutes: 18 },
      { zone: "ZONE_5", minutes: 3 },
    ])
  })
})

describe("minutesInZones", () => {
  it("bins samples on the standard Karvonen bands", () => {
    const thresholds = standardHeartRateThresholds({
      ageYears: 27,
      restingHeartRate: 56,
    })
    const t0 = new Date("2026-08-18T12:00:00Z").getTime()
    const rows = minutesInZones(
      [
        { time: t0, bpm: 80 },
        { time: t0 + 5 * 60_000, bpm: 120 },
        { time: t0 + 10 * 60_000, bpm: 120 },
        { time: t0 + 15 * 60_000, bpm: 150 },
      ],
      thresholds,
    )
    expect(rows.find((row) => row.zone === "ZONE_1")?.minutes).toBe(10)
    expect(rows.find((row) => row.zone === "ZONE_2")?.minutes).toBe(5)
    expect(rows.some((row) => row.zone === "REST")).toBe(false)
  })
})
