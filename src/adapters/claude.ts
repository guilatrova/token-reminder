// Claude (Claude Code subscriptions). Uses the login Claude Code saved on this machine and asks
// Anthropic how much of the plan is used. It only reads: it never refreshes a token or writes a login.
import type { AccountReading, UsageSource, UsageWindow, WindowKind } from '../core/usage'
import { finite, getJson, isRecord, UsageRequestFailed } from './http'

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
/** Where the person sees and redeems what this adapter cannot read: their limit resets. */
const USAGE_PAGE = 'https://claude.ai/settings/usage'

// Limit resets ("Full reset", "Fable reset") are NOT read, on purpose. Checked on 2026-11-18:
// - They come from this same endpoint with `?cedar_ember=1&skip_spend=1`, as `cedar_ember.grants[]`:
//   `label`, `type`, `resets_left`, `ends_at`, `usable_now`, `clears[]`. A reset to remind about is a
//   grant with `resets_left > 0`; `ends_at` is its expiry. That maps onto `resetCredits` as Codex's do.
// - Anthropic serves the grants only to a request that identifies as the current Claude Code CLI
//   (`User-Agent: claude-cli/<version> (external, cli)`). With the headers below the answer is
//   `eligible: false, ineligible_reason: "surface", grants: []` (seen on a real Max account), and
//   without the query the key is null. This plugin is not that CLI, so it does not claim to be.
// - Reports: github.com/stablyai/orca/issues/22309, github.com/anthropics/claude-code/issues/102846.
// When Anthropic serves the grants to other clients, read them here; nothing else has to change.
// Until then `usagePage` sends the person to the page that shows them.
const HOUR = 60 * 60 * 1000

/** Where Claude Code keeps its login: a macOS Keychain item, or this file in its config folder elsewhere. */
export const CLAUDE_KEYCHAIN_SERVICE = 'Claude Code-credentials'
export const CLAUDE_CREDENTIALS_FILE = '.credentials.json'

/** Claude Code files the Keychain item under the OS user name, or this one when the name has other characters. */
export function claudeKeychainAccount(username: string): string {
  return /^[a-zA-Z0-9._-]+$/.test(username) ? username : 'claude-code-user'
}

export type ClaudeConfig = {
  /** Resolves the saved login as JSON text, or null when Claude Code is not signed in here. */
  readCredentials: () => Promise<string | null>
  fetch: typeof fetch
}

type Login = { accessToken: string; plan: string | null }

/** "max" with the tier's multiplier when it names one: "max 20x". */
function planName(subscription: unknown, tier: unknown): string | null {
  if (typeof subscription !== 'string' || !subscription.trim()) return null
  const multiplier = typeof tier === 'string' ? /(?:^|_)max_(\d+x)$/i.exec(tier.trim())?.[1] : undefined
  return subscription.toLowerCase() === 'max' && multiplier ? `max ${multiplier.toLowerCase()}` : subscription
}

function parseLogin(text: string): Login | null {
  const file: unknown = JSON.parse(text)
  const oauth = isRecord(file) ? file.claudeAiOauth : null
  if (!isRecord(oauth) || typeof oauth.accessToken !== 'string' || !oauth.accessToken) return null
  return { accessToken: oauth.accessToken, plan: planName(oauth.subscriptionType, oauth.rateLimitTier) }
}

/** Reset times arrive as ISO text, epoch seconds or epoch milliseconds. */
function resetTime(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : finite(value)
  if (number !== null && Number.isFinite(number)) return number > 10_000_000_000 ? number : number * 1000
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function parseWindow(raw: unknown, kind: WindowKind, lengthMs: number): UsageWindow | null {
  if (!isRecord(raw)) return null
  const usedPercent = finite(raw.utilization) ?? finite(raw.used_percentage)
  if (usedPercent === null) return null
  return { kind, lengthMs, usedPercent: Math.min(100, Math.max(0, usedPercent)), resetsAt: resetTime(raw.resets_at) }
}

export function claudeUsage(config: ClaudeConfig): UsageSource {
  async function readAccount(login: Login): Promise<AccountReading> {
    try {
      const headers = {
        Authorization: `Bearer ${login.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/2.1.0',
      }
      const usage = await getJson(config.fetch, USAGE_URL, headers, 'Open Claude Code to refresh this login.')
      if (!isRecord(usage)) throw new UsageRequestFailed('unexpected-response', 'Anthropic answered without usage.')
      const windows = [
        parseWindow(usage.five_hour, 'session', 5 * HOUR),
        parseWindow(usage.seven_day, 'weekly', 7 * 24 * HOUR),
      ]
      return {
        status: 'ok',
        account: null,
        plan: login.plan,
        windows: windows.filter((window) => window !== null),
        resetCredits: null,
      }
    } catch (error) {
      if (!(error instanceof UsageRequestFailed)) throw error
      return { status: 'unavailable', account: null, reason: error.reason, detail: error.message }
    }
  }

  return {
    usagePage: USAGE_PAGE,
    read: async () => {
      const text = await config.readCredentials()
      const login = text === null ? null : parseLogin(text)
      return login ? [await readAccount(login)] : []
    },
  }
}
