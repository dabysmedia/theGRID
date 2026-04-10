import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const PREFIX = "scrypt"

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex")
  const key = scryptSync(pin, salt, 32).toString("hex")
  return `${PREFIX}$${salt}$${key}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return pin === stored
  }

  const [, salt, expectedHex] = parts
  const actual = scryptSync(pin, salt, 32)
  const expected = Buffer.from(expectedHex, "hex")
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function isLegacyPlainPin(stored: string): boolean {
  return !stored.startsWith(`${PREFIX}$`)
}

