// What every adapter needs to read a provider's JSON: one GET that turns each way of failing into
// a reason the core knows, and the two checks for values that arrive as `unknown`.
import type { UnavailableReason } from '../core/usage'

const TIMEOUT_MS = 10_000

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A request that did not produce usage. `message` is what the person reads. */
export class UsageRequestFailed extends Error {
  readonly reason: UnavailableReason

  constructor(reason: UnavailableReason, detail: string) {
    super(detail)
    this.reason = reason
  }
}

/** `expired` is what to tell the person when the provider rejects the login. */
export async function getJson(
  fetcher: typeof fetch,
  url: string,
  headers: Record<string, string>,
  expired: string,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetcher(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (error) {
    throw new UsageRequestFailed('network', error instanceof Error ? error.message : String(error))
  }
  if (response.status === 401 || response.status === 403) throw new UsageRequestFailed('login-expired', expired)
  if (!response.ok) throw new UsageRequestFailed('unexpected-response', `The provider answered ${response.status}.`)
  return response.json()
}
