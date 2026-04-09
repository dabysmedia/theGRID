import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

interface ApiMuscle {
  id: string
  code: string
  color: string
  name: string
}

interface ApiCategory {
  id: string
  code: string
  name: string
}

interface ApiType {
  id: string
  code: string
  name: string
}

export interface ApiExercise {
  id: string
  code: string
  name: string
  description?: string
  primaryMuscles: ApiMuscle[]
  secondaryMuscles: ApiMuscle[]
  types: ApiType[]
  categories: ApiCategory[]
}

/** Server-side in-memory cache — survives between requests within a single Node process. */
let cache: { data: ApiExercise[]; at: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
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

    const data: ApiExercise[] = await res.json()
    cache = { data, at: Date.now() }

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
