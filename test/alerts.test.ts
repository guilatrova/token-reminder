import { assert, test } from 'orca/testing'
import { DEFAULT_ALERT_RULES, evaluateAlert } from '../src/core/alerts'
import { buildReport, headline } from '../src/core/report'
import type { AccountUsage, UsageWindow } from '../src/core/usage'

const HOUR = 60 * 60 * 1000
const NOW = 1_800_000_000_000

function weekly(leftPercent: number, hoursToReset: number): UsageWindow {
  return { kind: 'weekly', usedPercent: 100 - leftPercent, resetsAt: NOW + hoursToReset * HOUR }
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
  assert.equal(headline(buildReport([account('Calm', weekly(90, 150))], DEFAULT_ALERT_RULES, NOW)), null)
})
