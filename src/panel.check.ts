// `orca plugin check` draws the panel once per scenario. Each one stubs the worker's answer,
// so the states that matter can be read without a login or a reset that is actually close.
import { defineCheck } from 'orca/testing'
import { DEFAULT_ALERT_RULES } from './core/alerts'
import { buildReport } from './core/report'
import type { AccountUsage } from './core/usage'

const HOUR = 60 * 60 * 1000
const NOW = Date.now()

function account(provider: string, leftPercent: number, hoursToReset: number, resets = 0): AccountUsage {
  return {
    provider,
    status: 'ok',
    account: 'person@example.com',
    plan: 'pro',
    windows: [{ kind: 'weekly', usedPercent: 100 - leftPercent, resetsAt: NOW + hoursToReset * HOUR }],
    resetCredits: { available: resets, nextExpiresAt: resets ? NOW + 320 * HOUR : null },
  }
}

const scenario = (accounts: AccountUsage[]) => ({
  requests: { 'usage.read': buildReport(accounts, DEFAULT_ALERT_RULES, NOW) },
})

export default defineCheck({
  'no logins': scenario([]),
  'on track with resets': scenario([account('Codex', 85, 149, 2)]),
  'spend soon and spend now': scenario([account('Alpha', 60, 40), account('Beta', 74, 20)]),
  'provider unavailable': scenario([
    {
      provider: 'Codex',
      status: 'unavailable',
      account: 'person@example.com',
      reason: 'login-expired',
      detail: 'Sign in to Codex again to refresh this login.',
    },
  ]),
})
