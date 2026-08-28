import { describe, expect, it } from "vitest"
import {
  journalPhotoIdFromUrl,
  JournalValidationError,
  normalizeAttachedStats,
  normalizeJournalPayload,
} from "@/lib/journal"

describe("journal payload validation", () => {
  it("keeps the supported metric snapshot and drops untrusted fields", () => {
    expect(
      normalizeAttachedStats({
        steps: { count: 12_345 },
        sleep: { durationMins: 455, quality: 4 },
        water: { amountOz: 96, goalOz: 128 },
        readiness: { score: 82, hrvMs: 54, restingHeartRate: 58 },
        privateNote: "must not be persisted",
      }),
    ).toEqual({
      steps: { count: 12_345 },
      sleep: { durationMins: 455, quality: 4 },
      water: { amountOz: 96, goalOz: 128 },
      readiness: { score: 82, hrvMs: 54, restingHeartRate: 58 },
    })
  })

  it("accepts a photo-only progress post", () => {
    expect(
      normalizeJournalPayload({
        date: "2026-08-27",
        content: "",
        mood: null,
        images: ["/uploads/journal/cm123abc"],
        attachedStats: {},
      }),
    ).toMatchObject({ images: ["/uploads/journal/cm123abc"] })
  })

  it("rejects impossible dates and empty posts", () => {
    expect(() =>
      normalizeJournalPayload({
        date: "2026-02-30",
        content: "hello",
        mood: null,
        images: [],
        attachedStats: {},
      }),
    ).toThrow(JournalValidationError)

    expect(() =>
      normalizeJournalPayload({
        date: "2026-08-27",
        content: "   ",
        mood: null,
        images: [],
        attachedStats: {},
      }),
    ).toThrow("Add a photo")
  })

  it("only extracts opaque journal photo ids", () => {
    expect(journalPhotoIdFromUrl("/uploads/journal/cm123abc")).toBe("cm123abc")
    expect(journalPhotoIdFromUrl("/uploads/journal/legacy.jpg")).toBeNull()
    expect(journalPhotoIdFromUrl("/uploads/journal/a/b")).toBeNull()
  })
})
