import { describe, expect, it } from "vitest"
import {
  cardioActivityForGoogleType,
  cardioActivityLabel,
  durationStringToMinutes,
  isCardioActivity,
} from "@/lib/cardio"

describe("cardioActivityForGoogleType", () => {
  it("maps every flavour of bike to cycling", () => {
    for (const type of [
      "BIKING",
      "OUTDOOR_BIKE",
      "STATIONARY_BIKE",
      "SPINNING",
      "MOUNTAIN_BIKE",
      "ASSAULT_BIKE",
    ]) {
      expect(cardioActivityForGoogleType(type)).toBe("cycling")
    }
  })

  it("maps running machines and outdoor runs to running", () => {
    expect(cardioActivityForGoogleType("RUNNING")).toBe("running")
    expect(cardioActivityForGoogleType("TREADMILL")).toBe("running")
    expect(cardioActivityForGoogleType("TRAIL_RUN")).toBe("running")
  })

  it("maps the stair climber", () => {
    expect(cardioActivityForGoogleType("STAIRCLIMBER")).toBe("stair_stepper")
  })

  it("excludes walking-type activity so steps are never double-counted", () => {
    for (const type of [
      "WALKING",
      "POWER_WALKING",
      "TREADMILL_WALK",
      "INCLINE_WALK",
      "NORDIC_WALKING",
      "STROLLER_WALK",
      "HIKING",
      "RUCKING",
    ]) {
      expect(cardioActivityForGoogleType(type)).toBeNull()
    }
  })

  it("excludes strength and mobility work", () => {
    for (const type of ["STRENGTH_TRAINING", "WEIGHTLIFTING", "YOGA", "STRETCHING", "PILATES"]) {
      expect(cardioActivityForGoogleType(type)).toBeNull()
    }
  })

  it("ignores unknown, empty, and unspecified types", () => {
    expect(cardioActivityForGoogleType("SOMETHING_GOOGLE_ADDS_LATER")).toBeNull()
    expect(cardioActivityForGoogleType("EXERCISE_TYPE_UNSPECIFIED")).toBeNull()
    expect(cardioActivityForGoogleType("")).toBeNull()
    expect(cardioActivityForGoogleType(null)).toBeNull()
    expect(cardioActivityForGoogleType(undefined)).toBeNull()
  })

  it("accepts lowercase input", () => {
    expect(cardioActivityForGoogleType("biking")).toBe("cycling")
  })
})

describe("durationStringToMinutes", () => {
  it("parses protobuf durations", () => {
    expect(durationStringToMinutes("1800s")).toBe(30)
    expect(durationStringToMinutes("90s")).toBe(1.5)
    expect(durationStringToMinutes("3.5s")).toBeCloseTo(0.05833, 4)
    expect(durationStringToMinutes("0s")).toBe(0)
  })

  it("returns null for missing or malformed values", () => {
    expect(durationStringToMinutes(undefined)).toBeNull()
    expect(durationStringToMinutes(null)).toBeNull()
    expect(durationStringToMinutes("")).toBeNull()
    expect(durationStringToMinutes("abc")).toBeNull()
    expect(durationStringToMinutes("-60s")).toBeNull()
  })
})

describe("activity helpers", () => {
  it("recognises known slugs only", () => {
    expect(isCardioActivity("cycling")).toBe(true)
    expect(isCardioActivity("walking")).toBe(false)
    expect(isCardioActivity(42)).toBe(false)
  })

  it("falls back to a generic label for unknown slugs", () => {
    expect(cardioActivityLabel("stair_stepper")).toBe("Stair stepper")
    expect(cardioActivityLabel("whatever")).toBe("Cardio")
  })
})
