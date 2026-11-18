// The domain: what a plan's usage looks like, whichever provider reported it.
// Nothing here knows a vendor, the filesystem or the network.

/** `session` is the short rolling window (hours); `weekly` and `monthly` are the plan periods. */
export type WindowKind = 'session' | 'weekly' | 'monthly'

export type UsageWindow = {
  kind: WindowKind
  /** How long the window lasts, in ms. */
  lengthMs: number
  /** 0-100. Zero is a measured value. */
  usedPercent: number
  /** Epoch ms; null when the provider did not say. */
  resetsAt: number | null
}

/** Refills of the plan window the account earned and may still redeem. */
export type ResetCredits = {
  available: number
  /** Epoch ms when each available reset expires, soonest first; shorter than `available` when some are unknown. */
  expiresAt: number[]
}

export type UnavailableReason = 'login-expired' | 'network' | 'unexpected-response'

/** One login's usage as its provider reports it. `account` is who is signed in, when known. */
export type AccountReading =
  | {
      status: 'ok'
      account: string | null
      plan: string | null
      windows: UsageWindow[]
      resetCredits: ResetCredits | null
    }
  | { status: 'unavailable'; account: string | null; reason: UnavailableReason; detail: string }

/**
 * The port every provider implements. Adapters: claude, codex, grok, memory.
 * `read` answers one entry per login it finds, none when the person has no login. A login it
 * cannot read comes back as `unavailable`; it throws only when it cannot look for logins at all.
 */
export interface UsageSource {
  read(): Promise<AccountReading[]>
  /** The provider's own usage page, for what it shows there and does not report here. */
  usagePage?: string
}

/** A reading with the display name of the provider it came from, e.g. "Codex". */
export type AccountUsage = AccountReading & { provider: string; usagePage?: string }

/** Names one login across reads: what its own alert rules and the panel's open rows are kept under. */
export function accountKey(usage: Pick<AccountUsage, 'provider' | 'account'>): string {
  return `${usage.provider}\n${usage.account ?? ''}`
}

/** Reads every source, keyed by provider name. One provider failing never hides the others. */
export async function readAllUsage(sources: Record<string, UsageSource>): Promise<AccountUsage[]> {
  const perProvider = await Promise.all(
    Object.entries(sources).map(async ([provider, source]): Promise<AccountUsage[]> => {
      try {
        return (await source.read()).map((reading) => ({ ...reading, provider, usagePage: source.usagePage }))
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return [{ provider, status: 'unavailable', account: null, reason: 'unexpected-response', detail }]
      }
    }),
  )
  return perProvider.flat()
}

export function leftPercent(window: UsageWindow): number {
  return 100 - window.usedPercent
}
