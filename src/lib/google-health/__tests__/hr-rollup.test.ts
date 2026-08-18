import { describe, expect, it } from "vitest"
import { heartRateRollupPointsToBuckets } from "@/lib/google-health/hr-buckets"

describe("heartRateRollupPointsToBuckets", () => {
  it("keeps 5-minute averages and drops empty windows", () => {
    expect(
      heartRateRollupPointsToBuckets([
        { startTime: "2026-08-17T12:00:00.000Z", avgBpm: 64.4 },
        { startTime: "2026-08-17T12:05:00.000Z", avgBpm: 0 },
        { startTime: "2026-08-17T12:10:00.000Z", avgBpm: 71 },
        { startTime: "not-a-date", avgBpm: 80 },
      ]),
    ).toEqual([
      { time: "2026-08-17T12:00:00.000Z", bpm: 64 },
      { time: "2026-08-17T12:10:00.000Z", bpm: 71 },
    ])
  })

  it("sorts buckets in time order", () => {
    expect(
      heartRateRollupPointsToBuckets([
        { startTime: "2026-08-17T13:00:00.000Z", avgBpm: 90 },
        { startTime: "2026-08-17T12:00:00.000Z", avgBpm: 60 },
      ]).map((row) => row.time),
    ).toEqual(["2026-08-17T12:00:00.000Z", "2026-08-17T13:00:00.000Z"])
  })
})
