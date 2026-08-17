import { afterEach, describe, expect, it, vi } from "vitest"
import {
  GOOGLE_HEALTH_SYNCED_EVENT,
  LOG_SAVED_EVENT,
  notifyAppDataRefreshed,
  shouldRequestGoogleHealthSync,
} from "@/lib/google-health-client-sync"

describe("shouldRequestGoogleHealthSync", () => {
  it("only syncs when the server is configured and this profile is connected", () => {
    expect(shouldRequestGoogleHealthSync({})).toBe(false)
    expect(shouldRequestGoogleHealthSync({ configured: true })).toBe(false)
    expect(shouldRequestGoogleHealthSync({ connected: true })).toBe(false)
    expect(
      shouldRequestGoogleHealthSync({ configured: true, connected: true }),
    ).toBe(true)
  })
})

describe("notifyAppDataRefreshed", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("broadcasts a silent log-saved so hub views reload without dimming", () => {
    const dispatchEvent = vi.fn()
    class TestEvent {
      type: string
      detail: unknown
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    }
    vi.stubGlobal("CustomEvent", TestEvent)
    vi.stubGlobal("window", { dispatchEvent })

    notifyAppDataRefreshed({ source: "pull-refresh", synced: true })

    expect(dispatchEvent).toHaveBeenCalledTimes(2)
    const types = dispatchEvent.mock.calls.map((call) => {
      const event = call[0] as { type: string; detail?: unknown }
      return event.type
    })
    expect(types).toEqual([GOOGLE_HEALTH_SYNCED_EVENT, LOG_SAVED_EVENT])
    const logSaved = dispatchEvent.mock.calls[1]?.[0] as { detail: unknown }
    expect(logSaved.detail).toMatchObject({
      silent: true,
      source: "pull-refresh",
      synced: true,
    })
  })
})
