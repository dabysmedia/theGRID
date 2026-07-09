import "server-only"

import { isGoogleHealthConfigured } from "@/lib/google-health/config"
import { syncGoogleHealthForAllUsers } from "@/lib/google-health/sync"

const INTERVAL_MS = 15 * 60 * 1000
const INITIAL_DELAY_MS = 45_000

const globalForScheduler = globalThis as unknown as {
  __thegridGoogleHealthScheduler?: {
    started: boolean
    timer?: ReturnType<typeof setInterval>
    running: boolean
  }
}

function state() {
  if (!globalForScheduler.__thegridGoogleHealthScheduler) {
    globalForScheduler.__thegridGoogleHealthScheduler = {
      started: false,
      running: false,
    }
  }
  return globalForScheduler.__thegridGoogleHealthScheduler
}

async function tick() {
  const s = state()
  if (s.running) {
    console.log("[google-health scheduler] previous sync still running — skip")
    return
  }
  if (!isGoogleHealthConfigured()) {
    console.log("[google-health scheduler] skipped — OAuth not configured")
    return
  }

  s.running = true
  try {
    const result = await syncGoogleHealthForAllUsers({
      days: 3,
      metrics: { steps: true, sleep: true, weight: false, vitals: true },
    })
    console.log(
      `[google-health scheduler] synced users=${result.users} ok=${result.ok} failed=${result.failed}`,
    )
  } catch (e) {
    console.error("[google-health scheduler]", e)
  } finally {
    s.running = false
  }
}

/**
 * Starts an in-process 15-minute Google Health sync loop.
 * Used so Railway keeps Fitbit data fresh without depending on GitHub Actions secrets.
 */
export function startGoogleHealthScheduler() {
  if (process.env.GOOGLE_HEALTH_SCHEDULER === "0") {
    console.log("[google-health scheduler] disabled via GOOGLE_HEALTH_SCHEDULER=0")
    return
  }

  const s = state()
  if (s.started) return
  s.started = true

  console.log("[google-health scheduler] starting (every 15 min)")

  // First pull shortly after boot so a fresh deploy doesn't wait a full interval.
  setTimeout(() => {
    void tick()
  }, INITIAL_DELAY_MS)

  s.timer = setInterval(() => {
    void tick()
  }, INTERVAL_MS)

  // Don't keep the process alive solely for the timer in edge cases.
  if (typeof s.timer.unref === "function") s.timer.unref()
}
