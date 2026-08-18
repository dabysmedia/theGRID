import { describe, expect, it } from "vitest"
import {
  ageYearsFromBirthDate,
  cardioZoneForBpm,
  estimatedMaxHeartRate,
  interpolateCardioSeries,
  pickPrimaryCardioSession,
  profileCardioHeartRateZones,
  samplesInWindow,
} from "@/lib/cardio-heart-rate"

describe("ageYearsFromBirthDate", () => {
  it("is 27 on the 27th birthday", () => {
    expect(ageYearsFromBirthDate("1999-08-16", "2026-08-16")).toBe(27)
  })

  it("is still 26 the day before", () => {
    expect(ageYearsFromBirthDate("1999-08-16", "2026-08-15")).toBe(26)
  })
})

describe("profileCardioHeartRateZones", () => {
  it("uses 220 − age and Karvonen percentages", () => {
    const profile = profileCardioHeartRateZones({
      ageYears: 27,
      weightLb: 185,
      restingHeartRate: 56,
    })
    expect(profile.maxHr).toBe(193)
    expect(profile.heartRateReserve).toBe(137)
    expect(profile.weightLb).toBe(185)
    expect(profile.thresholds.map((band) => [band.zone, band.minBpm, band.maxBpm])).toEqual([
      ["OUT_OF_RANGE", 0, 138],
      ["FAT_BURN", 138, 152],
      ["CARDIO", 152, 172],
      ["PEAK", 172, 208],
    ])
    expect(cardioZoneForBpm(160, profile.thresholds).key).toBe("CARDIO")
    expect(cardioZoneForBpm(160, profile.thresholds).label).toBe("Zone 3")
    expect(cardioZoneForBpm(180, profile.thresholds).key).toBe("PEAK")
    expect(cardioZoneForBpm(180, profile.thresholds).label).toBe("Zone 4")
  })

  it("falls back to age 27 when birth date is missing", () => {
    expect(estimatedMaxHeartRate(27)).toBe(193)
    const profile = profileCardioHeartRateZones({})
    expect(profile.ageYears).toBe(27)
    expect(profile.maxHr).toBe(193)
  })
})

describe("samplesInWindow / pickPrimaryCardioSession", () => {
  const samples = [
    { time: "2026-08-15T21:30:00.000Z", bpm: 150 },
    { time: "2026-08-15T21:35:00.000Z", bpm: 168 },
    { time: "2026-08-15T18:00:00.000Z", bpm: 90 },
  ]

  it("keeps only samples inside the session window", () => {
    expect(
      samplesInWindow(samples, "2026-08-15T21:25:00.000Z", "2026-08-15T22:40:00.000Z"),
    ).toHaveLength(2)
  })

  it("prefers the session that actually has heart-rate samples", () => {
    const picked = pickPrimaryCardioSession(
      [
        {
          id: "empty",
          minutes: 45,
          startTime: "2026-08-15T12:00:00.000Z",
          endTime: "2026-08-15T12:45:00.000Z",
        },
        {
          id: "ride",
          minutes: 40,
          startTime: "2026-08-15T21:25:00.000Z",
          endTime: "2026-08-15T22:40:00.000Z",
        },
      ],
      samples,
    )
    expect(picked?.id).toBe("ride")
  })
})

describe("interpolateCardioSeries", () => {
  it("moves smoothly between samples", () => {
    const points = [
      { t: 0, v: 120 },
      { t: 10, v: 160 },
    ]
    expect(interpolateCardioSeries(points, 5)?.v).toBe(140)
  })
})
