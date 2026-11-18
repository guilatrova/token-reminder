import { assert, test } from 'orca/testing'
import { DEFAULT_ALERT_RULES, evaluateAlert } from '../src/core/alerts'
import { buildReport, headline } from '../src/core/report'
import type { AccountUsage, UsageWindow } from '../src/core/usage'

const HOUR = 60 * 60 * 1000
const NOW = 1_800_000_000_000

function weekly(leftPercent: number, hoursToReset: number): UsageWindow {
  return { kind: 'weekly', lengthMs: 168 * HOUR, usedPercent: 100 - leftPercent, resetsAt: NOW + hoursToReset * HOUR }
}

function levelOf(window: UsageWindow): string | undefined {
  return evaluateAlert(window, DEFAULT_ALERT_RULES, NOW)?.level
}

test('a far reset is on track however much is left', () => {
  assert.equal(levelOf(weekly(95, 100)), 'ok')
})

test('little left near the reset is on track: there is nothing to lose', () => {
  assert.equal(levelOf(weekly(20, 5)), 'ok')
})

test('half left two days out warns, and the worst matching rule wins', () => {
  assert.equal(levelOf(weekly(50, 48)), 'warning')
  assert.equal(levelOf(weekly(60, 20)), 'warning')
  assert.equal(levelOf(weekly(74, 20)), 'urgent')
  assert.equal(levelOf(weekly(92, 9)), 'urgent')
})

test('a session window and an unknown reset are not judged', () => {
  assert.equal(evaluateAlert({ ...weekly(99, 1), kind: 'session' }, DEFAULT_ALERT_RULES, NOW), null)
  assert.equal(evaluateAlert({ ...weekly(99, 1), resetsAt: null }, DEFAULT_ALERT_RULES, NOW), null)
})

test('the report puts the most pressing account first and headlines it', () => {
  const account = (provider: string, window: UsageWindow): AccountUsage => ({
    provider,
    status: 'ok',
    account: null,
    plan: null,
    windows: [window],
    resetCredits: null,
  })
  const down: AccountUsage = { provider: 'Down', status: 'unavailable', account: null, reason: 'network', detail: 'x' }
  const report = buildReport(
    [down, account('Calm', weekly(90, 150)), account('Soon', weekly(60, 40)), account('Now', weekly(80, 12))],
    DEFAULT_ALERT_RULES,
    NOW,
  )
  assert.deepEqual(
    report.accounts.map((entry) => entry.provider),
    ['Now', 'Soon', 'Calm', 'Down'],
  )
  assert.deepEqual(headline(report), { provider: 'Now', leftPercent: 80, level: 'urgent', resetsAt: NOW + 12 * HOUR })
  assert.equal(headline(buildReport([down], DEFAULT_ALERT_RULES, NOW)), null)
})

test('a reset is judged by its expiry against the plan left, and colours the account', () => {
  const usage: AccountUsage = {
    provider: 'Alpha',
    status: 'ok',
    account: null,
    plan: null,
    windows: [{ kind: 'session', lengthMs: 5 * HOUR, usedPercent: 10, resetsAt: NOW + HOUR }, weekly(60, 98)],
    resetCredits: { available: 3, expiresAt: [NOW + 30 * HOUR, NOW + 288 * HOUR] },
  }
  const [account] = buildReport([usage], DEFAULT_ALERT_RULES, NOW).accounts
  assert.ok(account?.status === 'ok')
  assert.deepEqual(
    account.windows.map((window) => [window.kind, window.alert?.level, Math.round(window.timeLeftPercent ?? -1)]),
    [
      ['weekly', 'ok', 58],
      ['session', undefined, 20],
    ],
  )
  assert.equal(Math.round(account.windows[0]?.atRiskPercent ?? -1), 2)
  assert.deepEqual(
    account.resets.map((reset) => reset.alert?.level),
    ['warning', 'ok', undefined],
  )
  assert.equal(account.level, 'warning')
  assert.deepEqual(
    account.advice && [account.advice.leftPercent, Math.round(account.advice.perDayPercent ?? -1)],
    [60, 15],
  )
})

test('advice gives no daily pace with under a day to go, and none without resets', () => {
  const account = (resets: number, hoursToReset: number): AccountUsage => ({
    provider: 'Alpha',
    status: 'ok',
    account: null,
    plan: null,
    windows: [weekly(74, hoursToReset)],
    resetCredits: { available: resets, expiresAt: [] },
  })
  const adviceOf = (usage: AccountUsage) => {
    const [reported] = buildReport([usage], DEFAULT_ALERT_RULES, NOW).accounts
    return reported?.status === 'ok' ? reported.advice : undefined
  }
  assert.deepEqual(adviceOf(account(1, 20)), { leftPercent: 74, before: NOW + 20 * HOUR, perDayPercent: null })
  assert.equal(adviceOf(account(0, 20)), null)
})
