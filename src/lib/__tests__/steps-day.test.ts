import { describe, expect, it } from "vitest"
import {
  STEPS_DAY_BOUNDARY_HOUR,
  addDaysYmd,
  bucketStepsByStepsDay,
  getStepsDayRange,
  hourlyStepsForStepsDay,
  localCalendarDayKey,
  stepsDayHourIndex,
  stepsDayKey,
  stepsRefDayKey,
} from "@/lib/steps-day"

const TZ = "America/New_York"

/** Build a Date that is `localYmd` at `hour:minute` in TZ. */
function atLocal(localYmd: string, hour: number, minute = 0): Date {
  const { start } = getStepsDayRange(localYmd, TZ)
  const ms =
    start.getTime() + ((hour - STEPS_DAY_BOUNDARY_HOUR) * 60 + minute) * 60_000
  return new Date(ms)
}

describe("stepsDayKey", () => {
  it("uses calendar date at and after 05:00 local", () => {
    expect(stepsDayKey(atLocal("2026-07-06", 5, 0), TZ)).toBe("2026-07-06")
    expect(stepsDayKey(atLocal("2026-07-06", 11, 30), TZ)).toBe("2026-07-06")
    expect(stepsDayKey(atLocal("2026-07-06", 23, 45), TZ)).toBe("2026-07-06")
  })

  it("attributes pre-05:00 local time to the previous calendar day", () => {
    // Tuesday 2am → Monday's steps day
    expect(stepsDayKey(atLocal("2026-07-07", 2, 0), TZ)).toBe("2026-07-06")
    expect(stepsDayKey(atLocal("2026-07-07", 4, 59), TZ)).toBe("2026-07-06")
  })

  it("switches to the new steps day exactly at 05:00", () => {
    expect(stepsDayKey(atLocal("2026-07-07", 4, 59), TZ)).toBe("2026-07-06")
    expect(stepsDayKey(atLocal("2026-07-07", 5, 0), TZ)).toBe("2026-07-07")
  })
})

describe("getStepsDayRange", () => {
  it("returns [05:00, next 05:00) in the given timezone", () => {
    const { start, end } = getStepsDayRange("2026-07-06", TZ)
    expect(stepsDayKey(start, TZ)).toBe("2026-07-06")
    expect(localCalendarDayKey(start, TZ)).toBe("2026-07-06")
    expect(stepsDayKey(end, TZ)).toBe("2026-07-07")
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it("is the window used for all-day heart-rate samples (not UTC midnight)", () => {
    const { start, end } = getStepsDayRange("2026-07-06", TZ)
    // 00:00 local on the calendar day is still the previous tracking day.
    expect(stepsDayKey(atLocal("2026-07-06", 0, 0), TZ)).toBe("2026-07-05")
    expect(start.toISOString()).not.toBe("2026-07-06T00:00:00.000Z")
    // 04:59 belongs to this range; 05:00 next day is exclusive end.
    expect(atLocal("2026-07-07", 4, 59).getTime()).toBeGreaterThanOrEqual(start.getTime())
    expect(atLocal("2026-07-07", 4, 59).getTime()).toBeLessThan(end.getTime())
    expect(atLocal("2026-07-07", 5, 0).getTime()).toBe(end.getTime())
  })
})

describe("stepsRefDayKey", () => {
  it("remaps calendar today before 5am to the previous steps day", () => {
    const tue2am = atLocal("2026-07-07", 2, 0)
    expect(stepsRefDayKey("2026-07-07", tue2am, TZ)).toBe("2026-07-06")
  })

  it("keeps historical dates unchanged", () => {
    const tue2am = atLocal("2026-07-07", 2, 0)
    expect(stepsRefDayKey("2026-07-05", tue2am, TZ)).toBe("2026-07-05")
  })
})

describe("bucketStepsByStepsDay", () => {
  it("puts late-night and early-morning hours on the previous steps day", () => {
    const mon23 = atLocal("2026-07-06", 23, 0)
    const tue00 = atLocal("2026-07-07", 0, 0)
    const tue01 = atLocal("2026-07-07", 1, 0)
    const tue05 = atLocal("2026-07-07", 5, 0)

    const bucketed = bucketStepsByStepsDay(
      [
        { startTime: mon23, count: 1000 },
        { startTime: tue00, count: 500 },
        { startTime: tue01, count: 250 },
        { startTime: tue05, count: 800 },
      ],
      TZ,
    )

    expect(bucketed.get("2026-07-06")).toBe(1750)
    expect(bucketed.get("2026-07-07")).toBe(800)
  })

  it("ignores zero/negative buckets", () => {
    const t = atLocal("2026-07-06", 12, 0)
    const bucketed = bucketStepsByStepsDay(
      [
        { startTime: t, count: 0 },
        { startTime: t, count: -5 },
        { startTime: t, count: 42 },
      ],
      TZ,
    )
    expect(bucketed.get("2026-07-06")).toBe(42)
  })
})

describe("hourly tracking-day buckets", () => {
  it("orders hours from 5am through 4am and keeps 1am on the prior day", () => {
    const mon05 = atLocal("2026-07-06", 5)
    const mon23 = atLocal("2026-07-06", 23)
    const tue01 = atLocal("2026-07-07", 1)
    const tue05 = atLocal("2026-07-07", 5)

    expect(stepsDayHourIndex(mon05, TZ)).toBe(0)
    expect(stepsDayHourIndex(mon23, TZ)).toBe(18)
    expect(stepsDayHourIndex(tue01, TZ)).toBe(20)
    expect(stepsDayHourIndex(tue05, TZ)).toBe(0)

    const hourly = hourlyStepsForStepsDay(
      [
        { startTime: mon05, count: 100 },
        { startTime: mon23, count: 200 },
        { startTime: tue01, count: 300 },
        { startTime: tue05, count: 400 },
      ],
      "2026-07-06",
      TZ,
    )

    expect(hourly).toHaveLength(24)
    expect(hourly[0]).toBe(100)
    expect(hourly[18]).toBe(200)
    expect(hourly[20]).toBe(300)
    expect(hourly.reduce((sum, count) => sum + count, 0)).toBe(600)
  })
})

describe("addDaysYmd", () => {
  it("crosses month boundaries", () => {
    expect(addDaysYmd("2026-06-30", 1)).toBe("2026-07-01")
    expect(addDaysYmd("2026-07-01", -1)).toBe("2026-06-30")
  })
})
