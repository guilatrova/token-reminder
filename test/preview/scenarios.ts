// The states the panel has to draw, as a stand-in for the worker. `npm run preview` serves them
// outside Orca, because Orca's own scenario tooling only covers components panels.
import { DEFAULT_ALERT_RULES, parseAlertRules, type AlertRules } from '../../src/core/alerts'
import { buildReport, type UsageReport } from '../../src/core/report'
import { accountKey, type AccountUsage, type UsageWindow } from '../../src/core/usage'
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
    { ...account('Claude', 'max', [weekly(96, 6 * DAY + 8 * HOUR)]), usagePage: 'https://claude.ai/settings/usage' },
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
  'own-rules': [
    account('Codex', 'pro', [weekly(84, 6 * DAY + 3 * HOUR)], [4 * DAY + 9 * HOUR, 24 * DAY]),
    account('Claude', 'max', [weekly(87, 6 * DAY + 7 * HOUR)]),
    account('Grok', null, [weekly(89, 5 * DAY + 5 * HOUR)]),
  ],
  'tibo-complete': [account('Codex', 'pro', [weekly(0, 3 * DAY)])],
  'no-accounts': [],
  loading: 'loading',
  error: 'error',
}

/** Scenarios that start from rules of their own instead of the built-in ones. */
const RULES: Record<string, AlertRules> = {
  // Claude with rules of its own, one of them a mark that never alerts; Codex with a reset about to expire.
  'own-rules': {
    general: DEFAULT_ALERT_RULES.general,
    accounts: {
      [accountKey({ provider: 'Claude', account: 'person@example.com' })]: {
        plan: [
          { withinMs: 3 * DAY, minLeftPercent: 60, level: 'mark' },
          { withinMs: DAY, minLeftPercent: 30, level: 'urgent' },
        ],
      },
    },
  },
}

export const scenarioNames = Object.keys(SCENARIOS)

/** Answers the panel's requests the way src/app.ts does, from the named scenario. */
export function fakeWorker(
  name: string,
  simulatedUsage?: () => number,
): (request: string, input?: unknown) => Promise<UsageReport | Preferences> {
  const scenario = SCENARIOS[name]
  if (scenario === undefined) throw new Error(`Unknown scenario "${name}". Known: ${scenarioNames.join(', ')}`)
  let rules = RULES[name] ?? DEFAULT_ALERT_RULES
  let tiboReset = !!simulatedUsage
  let preferences = DEFAULT_PREFERENCES
  return async (request, input) => {
    if (scenario === 'loading') return new Promise(() => {})
    if (scenario === 'error') throw new Error('The worker could not be reached.')
    if (request === 'tibo.set') tiboReset = (input as { active: boolean }).active
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
    const accounts = simulatedUsage ? [account('Codex', 'pro', [weekly(100 - simulatedUsage(), 3 * DAY)])] : scenario
    return buildReport(accounts, rules, Date.now(), tiboReset)
  }
}
