/** JSON-safe clone: ISO dates, bigint as strings, strips null prototypes. */
export function toAgentJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v instanceof Date) return v.toISOString()
      if (typeof v === "bigint") return v.toString()
      return v
    })
  ) as T
}
