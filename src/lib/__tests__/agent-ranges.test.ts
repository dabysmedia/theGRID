import { describe, expect, it } from "vitest"
import { isAgentRangeSlug } from "@/lib/agent/range-presets"
import {
  AGENT_RANGE_PRESETS,
  resolveAgentRange,
  resolveAgentRangeFromParams,
  shouldIncludeHeartRateSamples,
} from "@/lib/agent/ranges"

const TZ = "America/New_York"
// 2026-08-28 is a Friday.
const TODAY = "2026-08-28"

describe("resolveAgentRange", () => {
  it("resolves every advertised preset", () => {
    for (const preset of AGENT_RANGE_PRESETS) {
      const range = resolveAgentRange(preset.key, TODAY, TZ)
      expect(range, preset.key).not.toBeNull()
      expect(range!.key).toBe(preset.key)
      expect(range!.from <= range!.to).toBe(true)
    }
  })

  it("bounds today and yesterday to a single day", () => {
    expect(resolveAgentRange("today", TODAY, TZ)).toMatchObject({
      from: TODAY,
      to: TODAY,
      days: 1,
    })
    expect(resolveAgentRange("yesterday", TODAY, TZ)).toMatchObject({
      from: "2026-08-27",
      to: "2026-08-27",
      days: 1,
    })
  })

  it("makes rolling windows inclusive of today", () => {
    expect(resolveAgentRange("7d", TODAY, TZ)).toMatchObject({
      from: "2026-08-22",
      to: TODAY,
      days: 7,
    })
    expect(resolveAgentRange("30d", TODAY, TZ)).toMatchObject({
      from: "2026-07-30",
      to: TODAY,
      days: 30,
    })
  })

  it("starts the week on Monday", () => {
    expect(resolveAgentRange("week", TODAY, TZ)).toMatchObject({
      from: "2026-08-24",
      to: TODAY,
    })
    expect(resolveAgentRange("last-week", TODAY, TZ)).toMatchObject({
      from: "2026-08-17",
      to: "2026-08-23",
      days: 7,
    })
  })

  it("resolves calendar month windows", () => {
    expect(resolveAgentRange("month", TODAY, TZ)).toMatchObject({
      from: "2026-08-01",
      to: TODAY,
    })
    expect(resolveAgentRange("last-month", TODAY, TZ)).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-31",
      days: 31,
    })
    expect(resolveAgentRange("ytd", TODAY, TZ)).toMatchObject({
      from: "2026-01-01",
      to: TODAY,
    })
  })

  it("treats all-time as unbounded", () => {
    expect(resolveAgentRange("all", TODAY, TZ)).toMatchObject({ to: TODAY, days: null })
  })

  it("accepts explicit day keys and spans", () => {
    expect(resolveAgentRange("2026-08-01", TODAY, TZ)).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-01",
      days: 1,
    })
    expect(resolveAgentRange("2026-08-01..2026-08-10", TODAY, TZ)).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-10",
      days: 10,
    })
  })

  it("rejects junk, inverted spans, and out-of-bounds windows", () => {
    for (const bad of [
      "",
      "bogus",
      "0d",
      "9999d",
      "2026-13-01",
      "2026-08-10..2026-08-01",
      "../../etc/passwd",
    ]) {
      expect(resolveAgentRange(bad, TODAY, TZ), bad).toBeNull()
    }
  })
})

describe("resolveAgentRangeFromParams", () => {
  const params = (q: string) => new URLSearchParams(q)

  it("defaults to today", () => {
    expect(resolveAgentRangeFromParams(params(""), TODAY, TZ)).toMatchObject({ key: "today" })
  })

  it("reads a preset slug", () => {
    expect(resolveAgentRangeFromParams(params("range=30d"), TODAY, TZ)).toMatchObject({
      key: "30d",
    })
  })

  it("lets explicit from/to win over a preset", () => {
    expect(
      resolveAgentRangeFromParams(params("range=7d&from=2026-01-01&to=2026-01-31"), TODAY, TZ)
    ).toMatchObject({ from: "2026-01-01", to: "2026-01-31" })
  })
})

describe("isAgentRangeSlug", () => {
  it("accepts what resolveAgentRange accepts", () => {
    for (const good of [...AGENT_RANGE_PRESETS.map((p) => p.key), "45d", "2026-08-01", "2026-08-01..2026-08-10"]) {
      expect(isAgentRangeSlug(good), good).toBe(true)
    }
  })

  it("rejects what resolveAgentRange rejects", () => {
    for (const bad of ["", "bogus", "0d", "9999d", "2026-08-10..2026-08-01", "wp-admin"]) {
      expect(isAgentRangeSlug(bad), bad).toBe(false)
    }
  })
})

describe("shouldIncludeHeartRateSamples", () => {
  it("inlines raw buckets only for short windows", () => {
    expect(shouldIncludeHeartRateSamples(resolveAgentRange("today", TODAY, TZ)!)).toBe(true)
    expect(shouldIncludeHeartRateSamples(resolveAgentRange("7d", TODAY, TZ)!)).toBe(true)
    expect(shouldIncludeHeartRateSamples(resolveAgentRange("30d", TODAY, TZ)!)).toBe(false)
    expect(shouldIncludeHeartRateSamples(resolveAgentRange("all", TODAY, TZ)!)).toBe(false)
  })
})
