import { NextResponse } from "next/server"
import { enrichExerciseLibrary, type ApiExercise } from "@/lib/workouts/exercise-library"

export const dynamic = "force-dynamic"
export type { ApiExercise } from "@/lib/workouts/exercise-library"

/** Server-side in-memory cache — survives between requests within a single Node process. */
let cache: { data: ApiExercise[]; at: number; version: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
/** Bump when enrichment logic changes so dev/prod caches refresh. */
const CACHE_VERSION = 3

export async function GET() {
  if (cache && cache.version === CACHE_VERSION && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    })
  }

  const key = process.env.WORKOUTAPI_KEY?.trim()
  if (!key) {
    return NextResponse.json(
      { error: "WORKOUTAPI_KEY not configured on server." },
      { status: 503 },
    )
  }

  try {
    const res = await fetch("https://api.workoutapi.com/exercises", {
      headers: { "x-api-key": key },
      cache: "no-store",
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("[exercise-library] workoutapi error", res.status, text.slice(0, 200))
      return NextResponse.json(
        { error: `Upstream error ${res.status}` },
        { status: 502 },
      )
    }

    const raw: ApiExercise[] = await res.json()
    const data = enrichExerciseLibrary(raw)
    cache = { data, at: Date.now(), version: CACHE_VERSION }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    })
  } catch (err) {
    console.error("[exercise-library] fetch failed:", (err as Error).message)
    return NextResponse.json(
      { error: "Failed to reach exercise library API." },
      { status: 502 },
    )
  }
}
