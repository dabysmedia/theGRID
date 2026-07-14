import { describe, expect, it } from "vitest"
import {
  dailySleepDurationHours,
  pickPrimarySleepEntry,
  resolveSleepNightEntry,
  sleepDurationHours,
  sleepEntryPrimaryRank,
} from "@/lib/sleepDuration"

describe("sleepDurationHours", () => {
  it("computes overnight span from ISO timestamps", () => {
    expect(
      sleepDurationHours("2026-07-14T07:10:00.000Z", "2026-07-14T15:03:00.000Z"),
    ).toBe(7.9)
  })

  it("handles same-calendar-day manual logs where wake clock is earlier", () => {
    expect(sleepDurationHours("2026-07-14T23:00:00.000Z", "2026-07-14T07:00:00.000Z")).toBe(8)
  })
})

describe("dailySleepDurationHours", () => {
  it("does not average overlapping Google sessions for the same night", () => {
    // Full night ~7h53m plus staged subset ~4h5m — old dashboard averaged to ~6.0h.
    const fullNight = {
      bedtime: "2026-07-14T07:10:00.000Z", // 3:10 AM EDT
      wakeTime: "2026-07-14T15:03:00.000Z", // 11:03 AM EDT
      minutesAsleep: 465, // 7h 45m — Google's asleep total
      source: "google-health",
    }
    const subset = {
      bedtime: "2026-07-14T11:02:00.000Z", // 7:02 AM EDT
      wakeTime: "2026-07-14T15:07:00.000Z", // 11:07 AM EDT
      stagesJson: JSON.stringify([{ type: "LIGHT", startTime: "a", endTime: "b" }]),
      remMinutes: 40,
      lightMinutes: 120,
      deepMinutes: 50,
      source: "google-health",
    }

    expect(dailySleepDurationHours([fullNight, subset])).toBe(7.8)
    expect(dailySleepDurationHours([subset, fullNight])).toBe(7.8)
  })

  it("sums non-overlapping night + nap blocks", () => {
    const night = {
      bedtime: "2026-07-14T04:00:00.000Z",
      wakeTime: "2026-07-14T12:00:00.000Z", // 8h
    }
    const nap = {
      bedtime: "2026-07-14T18:00:00.000Z",
      wakeTime: "2026-07-14T19:30:00.000Z", // 1.5h
    }
    expect(dailySleepDurationHours([night, nap])).toBe(9.5)
  })

  it("returns 0 for an empty list", () => {
    expect(dailySleepDurationHours([])).toBe(0)
  })
})

describe("pickPrimarySleepEntry / resolveSleepNightEntry", () => {
  it("prefers the longer session over a staged subset", () => {
    const fullNight = {
      id: "full",
      bedtime: "2026-07-14T07:10:00.000Z",
      wakeTime: "2026-07-14T15:03:00.000Z",
      minutesAsleep: 465,
      source: "google-health" as const,
      stagesJson: "[]",
    }
    const subset = {
      id: "subset",
      bedtime: "2026-07-14T11:02:00.000Z",
      wakeTime: "2026-07-14T15:07:00.000Z",
      stagesJson: JSON.stringify([
        { type: "REM", startTime: "2026-07-14T11:02:00.000Z", endTime: "2026-07-14T12:00:00.000Z" },
      ]),
      remMinutes: 58,
      lightMinutes: 140,
      deepMinutes: 40,
      source: "google-health" as const,
    }

    expect(sleepEntryPrimaryRank(fullNight)).toBeGreaterThan(sleepEntryPrimaryRank(subset))
    expect(pickPrimarySleepEntry([subset, fullNight])?.id).toBe("full")

    const resolved = resolveSleepNightEntry([subset, fullNight])
    expect(resolved?.id).toBe("full")
    expect(resolved?.minutesAsleep).toBe(465)
    // Stages borrowed from the richer overlapping subset.
    expect(JSON.parse(resolved?.stagesJson ?? "[]")).toHaveLength(1)
    expect(resolved?.remMinutes).toBe(58)
    expect(sleepDurationHours(resolved!.bedtime, resolved!.wakeTime)).toBe(7.9)
  })
})
