import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

const STATE_TTL_MS = 15 * 60 * 1000

function stateSecret(): string {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    "thegrid-google-health-dev-state"
  )
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf
  return b.toString("base64url")
}

function sign(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url")
}

export function createOAuthState(userId: string): string {
  const payload = b64url(JSON.stringify({ u: userId, t: Date.now() }))
  return `${payload}.${sign(payload)}`
}

export function parseOAuthState(state: string): { userId: string } {
  const [payload, sig] = state.split(".")
  if (!payload || !sig) throw new Error("Invalid OAuth state")
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth state signature")
  }
  const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    u?: string
    t?: number
  }
  if (!raw.u || typeof raw.t !== "number") throw new Error("Invalid OAuth state payload")
  if (Date.now() - raw.t > STATE_TTL_MS) throw new Error("OAuth state expired")
  return { userId: raw.u }
}
