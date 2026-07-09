export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  // Production / Railway only — avoid hammering Google APIs during local `next dev`.
  if (process.env.NODE_ENV !== "production") return

  const { startGoogleHealthScheduler } = await import("@/lib/google-health/scheduler")
  startGoogleHealthScheduler()
}
