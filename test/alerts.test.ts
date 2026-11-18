import { assert, test } from 'orca/testing'
import { DEFAULT_ALERT_RULES, evaluateAlert, parseAlertRules, withRuleList, type AlertRule } from '../src/core/alerts'
import { buildReport, headline } from '../src/core/report'
import { accountKey, type AccountUsage, type UsageWindow } from '../src/core/usage'

const HOUR = 60 * 60 * 1000
const NOW = 1_800_000_000_000
const RULES = DEFAULT_ALERT_RULES.general

function weekly(leftPercent: number, hoursToReset: number): UsageWindow {
  return { kind: 'weekly', lengthMs: 168 * HOUR, usedPercent: 100 - leftPercent, resetsAt: NOW + hoursToReset * HOUR }
}

function levelOf(window: UsageWindow): string | undefined {
  return evaluateAlert(window, RULES, NOW)?.level
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
  assert.equal(evaluateAlert({ ...weekly(99, 1), kind: 'session' }, RULES, NOW), null)
  assert.equal(evaluateAlert({ ...weekly(99, 1), resetsAt: null }, RULES, NOW), null)
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
  assert.deepEqual(headline(report), {
    provider: 'Now',
    leftPercent: 80,
    level: 'urgent',
    resetsAt: NOW + 12 * HOUR,
    expiringReset: null,
  })
  assert.equal(headline(buildReport([down], DEFAULT_ALERT_RULES, NOW)), null)
})

test('a reset is judged by the reset rules, colours the account and becomes the headline', () => {
  const usage: AccountUsage = {
    provider: 'Alpha',
    status: 'ok',
    account: null,
    plan: null,
    windows: [{ kind: 'session', lengthMs: 5 * HOUR, usedPercent: 10, resetsAt: NOW + HOUR }, weekly(60, 98)],
    resetCredits: { available: 3, expiresAt: [NOW + 30 * HOUR, NOW + 288 * HOUR] },
  }
  const report = buildReport([usage], DEFAULT_ALERT_RULES, NOW)
  const [account] = report.accounts
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
    ['urgent', 'ok', undefined],
  )
  assert.equal(account.level, 'urgent')
  assert.equal(headline(report)?.expiringReset, NOW + 30 * HOUR)
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

const lone = (provider: string, window: UsageWindow): AccountUsage => ({
  provider,
  status: 'ok',
  account: null,
  plan: null,
  windows: [window],
  resetCredits: null,
})

test('an account with rules of its own is judged by them instead of the general ones', () => {
  const own: AlertRule[] = [{ withinMs: 100 * HOUR, minLeftPercent: 10, level: 'urgent' }]
  const rules = withRuleList(DEFAULT_ALERT_RULES, accountKey({ provider: 'Own', account: null }), 'plan', own)
  const report = buildReport([lone('Own', weekly(60, 40)), lone('Other', weekly(60, 40))], rules, NOW)
  assert.deepEqual(
    report.accounts.map((account) => [account.provider, account.status === 'ok' && account.level]),
    [
      ['Own', 'urgent'],
      ['Other', 'warning'],
    ],
  )
  const followsAgain = withRuleList(rules, accountKey({ provider: 'Own', account: null }), 'plan', null)
  assert.deepEqual(followsAgain, DEFAULT_ALERT_RULES)
})

test('plan rules ahead of the usage are marks on the main window, and a rule with no colour never alerts', () => {
  const plan: AlertRule[] = [
    { withinMs: 100 * HOUR, minLeftPercent: 40, level: 'mark' },
    { withinMs: 10 * HOUR, minLeftPercent: 40, level: 'warning' },
    { withinMs: 5 * HOUR, minLeftPercent: 90, level: 'urgent' },
  ]
  const rules = withRuleList(DEFAULT_ALERT_RULES, null, 'plan', plan)
  const [account] = buildReport([lone('Alpha', weekly(60, 40))], rules, NOW).accounts
  assert.ok(account?.status === 'ok')
  assert.equal(account.level, 'ok')
  assert.deepEqual(
    account.windows[0]?.marks.map((mark) => [mark.usedPercent, mark.aheadPercent, mark.rule.level, mark.kind]),
    // The place at 10% used is behind the 40% already used, so its mark is gone.
    [[60, 20, 'warning', 'plan']],
  )
})

test('rules saved before they had kinds and accounts become the general plan rules', () => {
  const old = [{ withinMs: 120 * HOUR, minLeftPercent: 20, level: 'urgent' }]
  assert.deepEqual(parseAlertRules(old), {
    general: { plan: old, reset: DEFAULT_ALERT_RULES.general.reset },
    accounts: {},
  })
  assert.deepEqual(parseAlertRules(DEFAULT_ALERT_RULES), DEFAULT_ALERT_RULES)
  assert.equal(parseAlertRules({ general: { plan: [] }, accounts: {} }), null)
  assert.equal(parseAlertRules({ ...DEFAULT_ALERT_RULES, accounts: { a: { plan: [{ level: 'loud' }] } } }), null)
})
