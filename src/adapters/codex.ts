// Codex (ChatGPT plans). Reads the logins the Codex CLI saved on this machine and asks the
// ChatGPT backend how much of each plan is used. It only reads: it never refreshes a token,
// writes a login file or redeems a reset.
import type {
  AccountReading,
  ResetCredits,
  UnavailableReason,
  UsageSource,
  UsageWindow,
  WindowKind,
} from '../core/usage'

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const RESET_CREDITS_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'
const TIMEOUT_MS = 10_000
const DAY_SECONDS = 24 * 60 * 60

export type CodexConfig = {
  /** Codex home folders to look in; each may hold an `auth.json`. */
  homes: string[]
  /** Resolves the file's text, or null when the file does not exist. */
  readFile: (path: string) => Promise<string | null>
  fetch: typeof fetch
}

type Login = { accessToken: string; accountId: string | null; email: string | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The id token is only read for the email it names, to label the account; it is not trusted. */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null
  const payload = idToken.split('.')[1]
  if (!payload) return null
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return isRecord(claims) && typeof claims.email === 'string' ? claims.email : null
  } catch {
    return null
  }
}

function parseLogin(text: string): Login | null {
  const file: unknown = JSON.parse(text)
  const tokens = isRecord(file) ? file.tokens : null
  if (!isRecord(tokens) || typeof tokens.access_token !== 'string' || !tokens.access_token) return null
  return {
    accessToken: tokens.access_token,
    accountId: typeof tokens.account_id === 'string' ? tokens.account_id : null,
    email: emailFromIdToken(tokens.id_token),
  }
}

function windowKind(seconds: number | null): WindowKind | null {
  if (seconds === null || seconds <= 0) return null
  if (seconds <= DAY_SECONDS) return 'session'
  return seconds <= 8 * DAY_SECONDS ? 'weekly' : 'monthly'
}

function parseWindow(raw: unknown): UsageWindow | null {
  if (!isRecord(raw)) return null
  const usedPercent = finite(raw.used_percent)
  const kind = windowKind(finite(raw.limit_window_seconds))
  if (usedPercent === null || kind === null) return null
  const resetAtSeconds = finite(raw.reset_at)
  return {
    kind,
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
    resetsAt: resetAtSeconds !== null && resetAtSeconds > 0 ? resetAtSeconds * 1000 : null,
  }
}

function soonestAvailableExpiry(payload: unknown): number | null {
  const credits = isRecord(payload) && Array.isArray(payload.credits) ? payload.credits : []
  const expiries = credits
    .filter((credit) => isRecord(credit) && credit.status === 'available')
    .map((credit) => (isRecord(credit) && typeof credit.expires_at === 'string' ? Date.parse(credit.expires_at) : NaN))
    .filter((expiresAt) => Number.isFinite(expiresAt))
  return expiries.length ? Math.min(...expiries) : null
}

class RequestFailed extends Error {
  readonly reason: UnavailableReason

  constructor(reason: UnavailableReason, detail: string) {
    super(detail)
    this.reason = reason
  }
}

export function codexUsage(config: CodexConfig): UsageSource {
  async function getJson(url: string, login: Login): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${login.accessToken}`,
      'User-Agent': 'codex-cli',
      'OpenAI-Beta': 'codex-1',
      originator: 'Codex Desktop',
    }
    if (login.accountId) headers['ChatGPT-Account-Id'] = login.accountId
    let response: Response
    try {
      response = await config.fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      throw new RequestFailed('network', error instanceof Error ? error.message : String(error))
    }
    if (response.status === 401 || response.status === 403) {
      throw new RequestFailed('login-expired', 'Sign in to Codex again to refresh this login.')
    }
    if (!response.ok) throw new RequestFailed('unexpected-response', `ChatGPT answered ${response.status}.`)
    return response.json()
  }

  /** The usage answer counts the resets; when each expires comes from a second, optional call. */
  async function readResetCredits(usage: Record<string, unknown>, login: Login): Promise<ResetCredits | null> {
    const summary = usage.rate_limit_reset_credits
    const available = isRecord(summary) ? finite(summary.available_count) : null
    if (available === null) return null
    if (available <= 0) return { available: 0, nextExpiresAt: null }
    // The expiry is optional detail: without it the count still shows, with the expiry unknown.
    const details = await getJson(RESET_CREDITS_URL, login).catch(() => null)
    return { available, nextExpiresAt: soonestAvailableExpiry(details) }
  }

  async function readAccount(login: Login): Promise<AccountReading> {
    const identity = { account: login.email }
    try {
      const usage = await getJson(USAGE_URL, login)
      if (!isRecord(usage) || typeof usage.plan_type !== 'string') {
        throw new RequestFailed('unexpected-response', 'ChatGPT answered without a plan.')
      }
      const rateLimit = isRecord(usage.rate_limit) ? usage.rate_limit : {}
      const windows = [parseWindow(rateLimit.primary_window), parseWindow(rateLimit.secondary_window)]
      return {
        ...identity,
        status: 'ok',
        plan: usage.plan_type,
        windows: windows.filter((window) => window !== null),
        resetCredits: await readResetCredits(usage, login),
      }
    } catch (error) {
      if (!(error instanceof RequestFailed)) throw error
      return { ...identity, status: 'unavailable', reason: error.reason, detail: error.message }
    }
  }

  async function readLogins(): Promise<Login[]> {
    const texts = await Promise.all(config.homes.map((home) => config.readFile(`${home}/auth.json`)))
    const logins = texts.flatMap((text) => (text === null ? [] : [parseLogin(text)])).filter((login) => login !== null)
    // The same account may be signed in under more than one home.
    const byAccount = new Map(logins.reverse().map((login) => [login.accountId ?? login.accessToken, login]))
    return [...byAccount.values()].reverse()
  }

  return { read: async () => Promise.all((await readLogins()).map(readAccount)) }
}
