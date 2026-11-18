// The states the panel has to draw, as a stand-in for the worker. `npm run preview` serves them
// outside Orca, because Orca's own scenario tooling only covers components panels.
import { DEFAULT_ALERT_RULES, parseAlertRules, type AlertRule } from '../../src/core/alerts'
import { buildReport, type UsageReport } from '../../src/core/report'
import type { AccountUsage, UsageWindow } from '../../src/core/usage'
import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from '../../src/preferences'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const weekly = (leftPercent: number, untilMs: number): UsageWindow => ({
  kind: 'weekly',
  lengthMs: 7 * DAY,
  usedPercent: 100 - leftPercent,
  resetsAt: Date.now() + untilMs,
})

function account(
  provider: string,
  plan: string | null,
  windows: UsageWindow[],
  resetsInMs: number[] = [],
): AccountUsage {
  const expiresAt = resetsInMs.map((ms) => Date.now() + ms)
  return {
    provider,
    status: 'ok',
    account: 'person@example.com',
    plan,
    windows,
    resetCredits: { available: expiresAt.length, expiresAt },
  }
}

/** `accounts` is what the providers answer; 'loading' never answers and 'error' fails. */
const SCENARIOS: Record<string, AccountUsage[] | 'loading' | 'error'> = {
  today: [
    account('Codex', 'pro', [weekly(85, 6 * DAY + 4 * HOUR)], [13 * DAY + 9 * HOUR, 24 * DAY + 9 * HOUR]),
    account('Claude', 'max', [weekly(96, 6 * DAY + 8 * HOUR)]),
    account('Grok', null, [weekly(89, 5 * DAY + 6 * HOUR)]),
  ],
  'late-week': [
    account('Codex', 'pro', [weekly(74, 20 * HOUR)], [8 * DAY, 19 * DAY]),
    account('Claude', 'max', [weekly(58, DAY + 14 * HOUR)]),
    account('Grok', null, [weekly(22, 9 * HOUR)]),
  ],
  'reset-expiring': [
    account('Codex', 'pro', [weekly(60, 4 * DAY + 2 * HOUR)], [DAY + 6 * HOUR, 12 * DAY]),
    account('Grok', null, [weekly(35, 2 * DAY + 6 * HOUR)]),
  ],
  'edge-cases': [
    // Two windows: the weekly one leads; the session one is listed in the detail.
    account('Claude', 'max', [
      { kind: 'session', lengthMs: 5 * HOUR, usedPercent: 40, resetsAt: Date.now() + 2 * HOUR },
      weekly(64, 30 * HOUR),
    ]),
    // A monthly plan with a reset whose expiry nobody reported.
    {
      provider: 'Codex',
      status: 'ok',
      account: 'free@example.com',
      plan: 'free',
      windows: [{ kind: 'monthly', lengthMs: 30 * DAY, usedPercent: 0, resetsAt: Date.now() + 29 * DAY }],
      resetCredits: { available: 1, expiresAt: [] },
    },
    // A window whose reset time is unknown, and a plan that reports no window at all.
    account('Grok', null, [{ kind: 'weekly', lengthMs: 7 * DAY, usedPercent: 30, resetsAt: null }]),
    account('Kimi', 'pro', []),
    {
      provider: 'Gemini',
      status: 'unavailable',
      account: 'a-very-long-address-that-must-not-break-the-row@example.com',
      reason: 'login-expired',
      detail: 'Sign in again to refresh this login. <b>not markup</b>',
    },
  ],
  'no-accounts': [],
  loading: 'loading',
  error: 'error',
}

export const scenarioNames = Object.keys(SCENARIOS)

/** Answers the panel's requests the way src/app.ts does, from the named scenario. */
export function fakeWorker(name: string): (request: string, input?: unknown) => Promise<UsageReport | Preferences> {
  const scenario = SCENARIOS[name]
  if (scenario === undefined) throw new Error(`Unknown scenario "${name}". Known: ${scenarioNames.join(', ')}`)
  let rules: AlertRule[] = DEFAULT_ALERT_RULES
  let preferences = DEFAULT_PREFERENCES
  return async (request, input) => {
    if (scenario === 'loading') return new Promise(() => {})
    if (scenario === 'error') throw new Error('The worker could not be reached.')
    if (request === 'preferences.read') return preferences
    if (request === 'preferences.save') {
      const parsed = parsePreferences(input)
      if (!parsed) throw new Error('Those preferences are not valid.')
      return (preferences = parsed)
    }
    if (request === 'rules.save') {
      const parsed = parseAlertRules((input as { rules?: unknown }).rules)
      if (!parsed) throw new Error('Those alert rules are not valid.')
      rules = parsed
    }
    return buildReport(scenario, rules, Date.now())
  }
}
