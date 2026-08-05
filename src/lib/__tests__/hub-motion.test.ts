import { describe, expect, it } from "vitest"
import { getHubMotionDelta } from "@/components/hub/HubMotion"

describe("getHubMotionDelta", () => {
  it("inverts position and size changes for a compositor FLIP", () => {
    expect(
      getHubMotionDelta(
        { left: 24, top: 500, width: 120, height: 80 },
        { left: 72, top: 140, width: 240, height: 160 },
      ),
    ).toEqual({
      x: -48,
      y: 360,
      scaleX: 0.5,
      scaleY: 0.5,
    })
  })

  it("keeps scale finite when the destination is temporarily unmeasurable", () => {
    expect(
      getHubMotionDelta(
        { left: 12, top: 18, width: 96, height: 48 },
        { left: 12, top: 18, width: 0, height: 0 },
      ),
    ).toEqual({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
    })
  })
})
