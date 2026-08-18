import { describe, expect, it } from "vitest"
import {
  EDGE_BACK_AXIS_LOCK_PX,
  EDGE_BACK_FLICK_MS,
  EDGE_BACK_THRESHOLD_PX,
  isEdgeBackStart,
  resolveEdgeBackTarget,
  setHubPanelOpen,
  shouldArmEdgeBack,
  shouldTriggerEdgeBack,
} from "@/lib/edge-back"

describe("isEdgeBackStart", () => {
  it("only starts from the left screen edge", () => {
    expect(isEdgeBackStart(0)).toBe(true)
    expect(isEdgeBackStart(20)).toBe(true)
    expect(isEdgeBackStart(80)).toBe(false)
    expect(isEdgeBackStart(-1)).toBe(false)
  })

  it("widens the zone by the safe-area inset", () => {
    expect(isEdgeBackStart(40, 20)).toBe(true)
    expect(isEdgeBackStart(80, 20)).toBe(false)
  })
})

describe("shouldArmEdgeBack", () => {
  it("ignores swipes that did not start on the edge", () => {
    expect(
      shouldArmEdgeBack({ fromEdge: false, deltaX: 40, deltaY: 4 }),
    ).toBe(false)
  })

  it("ignores vertical pans and leftward swipes", () => {
    expect(
      shouldArmEdgeBack({
        fromEdge: true,
        deltaX: 6,
        deltaY: 30,
      }),
    ).toBe(false)
    expect(
      shouldArmEdgeBack({
        fromEdge: true,
        deltaX: -20,
        deltaY: 0,
      }),
    ).toBe(false)
    expect(
      shouldArmEdgeBack({
        fromEdge: true,
        deltaX: EDGE_BACK_AXIS_LOCK_PX - 1,
        deltaY: 2,
      }),
    ).toBe(false)
  })

  it("arms a clearly rightward swipe from the edge", () => {
    expect(
      shouldArmEdgeBack({ fromEdge: true, deltaX: 24, deltaY: 4 }),
    ).toBe(true)
  })
})

describe("shouldTriggerEdgeBack", () => {
  it("commits after enough travel or a short flick", () => {
    expect(
      shouldTriggerEdgeBack({ travelPx: EDGE_BACK_THRESHOLD_PX, widthPx: 390, durationMs: 400 }),
    ).toBe(true)
    expect(
      shouldTriggerEdgeBack({ travelPx: 120, widthPx: 390, durationMs: 400 }),
    ).toBe(true)
    expect(
      shouldTriggerEdgeBack({
        travelPx: 40,
        widthPx: 390,
        durationMs: EDGE_BACK_FLICK_MS - 20,
      }),
    ).toBe(true)
    expect(
      shouldTriggerEdgeBack({ travelPx: 20, widthPx: 390, durationMs: 400 }),
    ).toBe(false)
  })
})

describe("resolveEdgeBackTarget", () => {
  it("collapses an expanded hub panel and otherwise uses history", () => {
    setHubPanelOpen(true)
    expect(resolveEdgeBackTarget("/")).toBe("hub")
    setHubPanelOpen(false)
    expect(resolveEdgeBackTarget("/")).toBe(null)
    expect(resolveEdgeBackTarget("/workouts")).toBe("history")
  })
})
