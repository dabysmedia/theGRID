export interface ActUser {
  id: string
  name: string
  timeZone: string | null
}

export interface ActContext {
  user: ActUser
  today: string
  now: Date
}

export type ActFn = (
  args: Record<string, unknown>,
  ctx: ActContext | null,
) => Promise<Record<string, unknown>>
