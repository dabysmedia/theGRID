import "server-only"

const GOOGLE_REQUEST_TIMEOUT_MS = 15_000

/**
 * Google Health requests must never hold a Railway request or scheduler tick
 * open indefinitely. The timeout signal remains active while the response body
 * is consumed, unlike clearing a timer as soon as response headers arrive.
 */
export function googleFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS)
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal

  return fetch(input, { ...init, signal })
}
