/** Recursively map Date → string and bigint → string to match JSON.stringify runtime behaviour. */
type JsonSafe<T> = T extends Date
  ? string
  : T extends bigint
    ? string
    : T extends (infer U)[]
      ? JsonSafe<U>[]
      : T extends object
        ? { [K in keyof T]: JsonSafe<T[K]> }
        : T

/** JSON-safe clone: ISO dates, bigint as strings, strips null prototypes. */
export function toAgentJson<T>(value: T): JsonSafe<T> {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v instanceof Date) return v.toISOString()
      if (typeof v === "bigint") return v.toString()
      return v
    })
  ) as JsonSafe<T>
}
