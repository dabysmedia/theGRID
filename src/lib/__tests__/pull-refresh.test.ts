import { describe, expect, it } from "vitest"
import {
  PULL_REFRESH_AXIS_LOCK_PX,
  PULL_REFRESH_MAX_PX,
  PULL_REFRESH_THRESHOLD_PX,
  dampenPullDistance,
  isScrollOffsetAtTop,
  pullRefreshArcFraction,
  pullRefreshProgress,
  remainingSpinnerMs,
  shouldArmPullRefresh,
  shouldTriggerPullRefresh,
} from "@/lib/pull-refresh"

describe("dampenPullDistance", () => {
  it("returns 0 for empty or upward travel", () => {
    expect(dampenPullDistance(0)).toBe(0)
    expect(dampenPullDistance(-40)).toBe(0)
    expect(dampenPullDistance(Number.NaN)).toBe(0)
  })

  it("rubber-bands below the raw distance and never exceeds the cap", () => {
    const mid = dampenPullDistance(80)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(80)
    expect(dampenPullDistance(400)).toBe(PULL_REFRESH_MAX_PX)
    expect(dampenPullDistance(10_000)).toBe(PULL_REFRESH_MAX_PX)
  })
})

describe("pullRefreshProgress", () => {
  it("maps travel onto 0–1 relative to the arm threshold", () => {
    expect(pullRefreshProgress(0)).toBe(0)
    expect(pullRefreshProgress(PULL_REFRESH_THRESHOLD_PX / 2)).toBe(0.5)
    expect(pullRefreshProgress(PULL_REFRESH_THRESHOLD_PX)).toBe(1)
    expect(pullRefreshProgress(PULL_REFRESH_THRESHOLD_PX * 3)).toBe(1)
  })
})

describe("shouldArmPullRefresh", () => {
  it("ignores pulls that are not at the top of the scroller", () => {
    expect(
      shouldArmPullRefresh({ atTop: false, deltaX: 0, deltaY: 40 }),
    ).toBe(false)
  })

  it("ignores horizontal swipes and sub-threshold jitter", () => {
    expect(
      shouldArmPullRefresh({
        atTop: true,
        deltaX: 30,
        deltaY: 8,
      }),
    ).toBe(false)
    expect(
      shouldArmPullRefresh({
        atTop: true,
        deltaX: 4,
        deltaY: PULL_REFRESH_AXIS_LOCK_PX - 1,
      }),
    ).toBe(false)
    expect(
      shouldArmPullRefresh({
        atTop: true,
        deltaX: 0,
        deltaY: -20,
      }),
    ).toBe(false)
  })

  it("arms a clearly downward vertical pull at the top", () => {
    expect(
      shouldArmPullRefresh({ atTop: true, deltaX: 4, deltaY: 24 }),
    ).toBe(true)
  })
})

describe("shouldTriggerPullRefresh", () => {
  it("fires only after the rubber-banded travel crosses the threshold", () => {
    expect(shouldTriggerPullRefresh(PULL_REFRESH_THRESHOLD_PX - 1)).toBe(false)
    expect(shouldTriggerPullRefresh(PULL_REFRESH_THRESHOLD_PX)).toBe(true)
    expect(shouldTriggerPullRefresh(PULL_REFRESH_MAX_PX)).toBe(true)
  })

  it("still triggers after rubber-banding a realistic ~80px finger pull", () => {
    expect(shouldTriggerPullRefresh(dampenPullDistance(50))).toBe(false)
    expect(shouldTriggerPullRefresh(dampenPullDistance(80))).toBe(true)
  })
})

describe("isScrollOffsetAtTop", () => {
  it("treats iOS rubber-band noise as still at the top", () => {
    expect(isScrollOffsetAtTop(0)).toBe(true)
    expect(isScrollOffsetAtTop(12)).toBe(true)
    expect(isScrollOffsetAtTop(80)).toBe(false)
  })
})

describe("pullRefreshArcFraction", () => {
  it("keeps a visible tail while spinning and grows with pull progress", () => {
    expect(pullRefreshArcFraction(0, false)).toBe(0.08)
    expect(pullRefreshArcFraction(0.5, false)).toBe(0.5)
    expect(pullRefreshArcFraction(1, false)).toBe(1)
    expect(pullRefreshArcFraction(0.1, true)).toBe(0.28)
  })
})

describe("remainingSpinnerMs", () => {
  it("holds the loading circle until the minimum visible time has elapsed", () => {
    expect(remainingSpinnerMs(1000, 480, 1100)).toBe(380)
    expect(remainingSpinnerMs(1000, 480, 1600)).toBe(0)
  })
})
