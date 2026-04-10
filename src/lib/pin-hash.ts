import "server-only"

import { scryptSync, randomBytes } from "node:crypto"

const KEY_LEN = 32

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex")
  const derived = scryptSync(pin, salt, KEY_LEN).toString("hex")
  return `scrypt$${salt}$${derived}`
}

export function verifyPin(pin: string, stored: string): boolean {
  if (!stored.startsWith("scrypt$")) return false
  const parts = stored.split("$")
  if (parts.length !== 3) return false
  const [, salt, hash] = parts
  const derived = scryptSync(pin, salt, KEY_LEN).toString("hex")
  return derived === hash
}
