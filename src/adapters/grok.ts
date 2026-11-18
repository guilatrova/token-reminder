// Grok (SuperGrok and X plans). Uses the login the Grok CLI saved on this machine and asks xAI's
// billing endpoint how much of the plan is used. It only reads: the Grok CLI owns sign-in and refresh.
import type { AccountReading, UsageSource, UsageWindow } from '../core/usage'
import { finite, getJson, isRecord, UsageRequestFailed } from './http'

const BILLING_URL = 'https://cli-chat-proxy.grok.com/v1/billing'
const DEFAULT_ISSUER = 'https://auth.x.ai'
const DAY = 24 * 60 * 60 * 1000
const EXPIRED = 'Run grok on this machine to refresh this login.'

export type GrokConfig = {
  /** The Grok CLI's `auth.json`. */
  authFile: string
  /** Resolves the file's text, or null when the file does not exist. */
  readFile: (path: string) => Promise<string | null>
  fetch: typeof fetch
  now: () => number
}

type Login = { accessToken: string; userId: string | null; email: string | null; expiresAt: number | null }

function parseEntry(entry: unknown): Login | null {
  if (!isRecord(entry) || typeof entry.key !== 'string' || !entry.key) return null
  const expiresAt = typeof entry.expires_at === 'string' ? Date.parse(entry.expires_at) : NaN
  return {
    accessToken: entry.key,
    userId: typeof entry.user_id === 'string' ? entry.user_id : null,
    email: typeof entry.email === 'string' ? entry.email : null,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
  }
}

/** The file holds one login per sign-in service. xAI's own comes first; another is used only when it is absent. */
function parseLogin(text: string): Login | null {
  const file: unknown = JSON.parse(text)
  if (!isRecord(file)) return null
  const isDefault = (issuer: string) => issuer === DEFAULT_ISSUER || issuer.startsWith(`${DEFAULT_ISSUER}::`)
  const entries = Object.entries(file)
  const preferred = entries.filter(([issuer]) => isDefault(issuer))
  const candidates = preferred.length ? preferred : entries
  return candidates.map(([, entry]) => parseEntry(entry)).find((login) => login !== null) ?? null
}

/** Amounts arrive as `{ val: "12.50" }`. */
function amount(value: unknown): number | null {
  const raw = isRecord(value) ? value.val : null
  const number = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  return finite(number)
}

function time(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

/** The period the plan's allowance covers: its end is the reset, and both ends give its length. */
function period(config: Record<string, unknown>): { resetsAt: number | null; lengthMs: number | null } {
  const current = isRecord(config.currentPeriod) ? config.currentPeriod : {}
  const start = time(current.start) ?? time(config.billingPeriodStart)
  const end = time(current.end) ?? time(config.billingPeriodEnd)
  return { resetsAt: end, lengthMs: start !== null && end !== null && end > start ? end - start : null }
}

/** Plans with a weekly allowance report the share used directly. */
function weeklyWindow(config: Record<string, unknown>): UsageWindow | null {
  const usedPercent = finite(config.creditUsagePercent)
  if (usedPercent === null) return null
  const { resetsAt, lengthMs } = period(config)
  return {
    kind: 'weekly',
    lengthMs: lengthMs ?? 7 * DAY,
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
    resetsAt,
  }
}

/** Plans with a monthly budget report what was spent against the limit. */
function monthlyWindow(config: Record<string, unknown>): UsageWindow | null {
  const limit = amount(config.monthlyLimit)
  const used = amount(config.used)
  if (limit === null || used === null || limit <= 0) return null
  const { resetsAt, lengthMs } = period(config)
  const usedPercent = Math.min(100, Math.max(0, (used / limit) * 100))
  return { kind: 'monthly', lengthMs: lengthMs ?? 30 * DAY, usedPercent, resetsAt }
}

export function grokUsage(config: GrokConfig): UsageSource {
  async function billing(url: string, login: Login): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${login.accessToken}`,
      'X-XAI-Token-Auth': 'xai-grok-cli',
      Accept: 'application/json',
    }
    if (login.userId) headers['x-userid'] = login.userId
    const data = await getJson(config.fetch, url, headers, EXPIRED)
    if (!isRecord(data)) throw new UsageRequestFailed('unexpected-response', 'xAI answered without billing data.')
    return isRecord(data.config) ? data.config : data
  }

  async function readWindow(login: Login): Promise<{ window: UsageWindow; plan: string | null }> {
    const credits = await billing(`${BILLING_URL}?format=credits`, login)
    const plan =
      typeof credits.subscriptionTier === 'string' && credits.subscriptionTier.trim()
        ? credits.subscriptionTier.trim()
        : null
    // Some accounts carry their monthly budget only in the default view.
    const window = weeklyWindow(credits) ?? monthlyWindow(credits) ?? monthlyWindow(await billing(BILLING_URL, login))
    if (!window)
      throw new UsageRequestFailed('unexpected-response', 'Grok did not report how much of this plan is used.')
    return { window, plan }
  }

  async function readAccount(login: Login): Promise<AccountReading> {
    try {
      if (login.expiresAt !== null && login.expiresAt <= config.now())
        throw new UsageRequestFailed('login-expired', EXPIRED)
      const { window, plan } = await readWindow(login)
      return { status: 'ok', account: login.email, plan, windows: [window], resetCredits: null }
    } catch (error) {
      if (!(error instanceof UsageRequestFailed)) throw error
      return { status: 'unavailable', account: login.email, reason: error.reason, detail: error.message }
    }
  }

  return {
    read: async () => {
      const text = await config.readFile(config.authFile)
      const login = text === null ? null : parseLogin(text)
      return login ? [await readAccount(login)] : []
    },
  }
}
