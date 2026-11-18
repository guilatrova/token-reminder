// What the panel and the status bar show: every account's usage with its alerts, worst first.
// Everything a surface displays is worked out here; surfaces only draw it.
import {
  evaluateAlert,
  isWorseRule,
  judge,
  RESET_RULE_KIND,
  rulesFor,
  WINDOW_RULE_KIND,
  worseLevel,
  type Alert,
  type AlertLevel,
  type AlertRule,
  type AlertRules,
  type RuleKind,
  type RuleSet,
} from './alerts'
import { accountKey, leftPercent, type AccountUsage, type UsageWindow } from './usage'

const DAY = 24 * 60 * 60 * 1000

export type WindowReport = UsageWindow & {
  alert: Alert | null
  /** Share of the window's time still ahead, 0-100. Null when the reset time is unknown. */
  timeLeftPercent: number | null
  /** Plan left beyond the time left: what is on course to go unused. Null when the reset time is unknown. */
  atRiskPercent: number | null
  /** The account's plan rules still ahead of the usage, as places on the bar, left to right. Only the main window has them. */
  marks: RuleMark[]
}

/** A plan rule drawn on the bar: the share used at which the rule stops matching. */
export type RuleMark = {
  usedPercent: number
  /** How much more of the plan must be used to get there. */
  aheadPercent: number
  rule: AlertRule
  kind: RuleKind
}

/** One reset the account can still redeem. Judged like a window: its expiry against the plan left. */
export type ResetReport = { expiresAt: number | null; alert: Alert | null }

/** How to put a reset to use: empty the plan before its window resets, then redeem. */
export type Advice = {
  leftPercent: number
  /** Epoch ms of the main window's reset. */
  before: number
  /** The pace that empties the plan in time. Null with under a day to go, where a daily pace says nothing. */
  perDayPercent: number | null
}

type OkUsage = Extract<AccountUsage, { status: 'ok' }>
type UnavailableUsage = Extract<AccountUsage, { status: 'unavailable' }>

export type OkAccountReport = Pick<OkUsage, 'provider' | 'account' | 'status' | 'plan'> & {
  /** The provider's own usage page; null when it has none. */
  usagePage: string | null
  key: string
  /** Longest window first: the first one is the plan period and drives the account's summary. */
  windows: WindowReport[]
  resets: ResetReport[]
  advice: Advice | null
  /** The worst alert among the windows and the resets. */
  level: AlertLevel
}

export type AccountReport = OkAccountReport | (UnavailableUsage & { key: string })

export type TiboMission = {
  startedAt: number
  finishedAt: number | null
  stats?: { accounts: number; localTokens: number | null }
}

export function restoreMission(value: unknown, now: number): TiboMission | null {
  if (value === true) return { startedAt: now, finishedAt: null }
  if (!value || typeof value !== 'object' || !('startedAt' in value) || !('finishedAt' in value)) return null
  const { startedAt, finishedAt } = value
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null
  if (finishedAt !== null && (typeof finishedAt !== 'number' || !Number.isFinite(finishedAt) || finishedAt < startedAt))
    return null
  const mission: TiboMission = { startedAt, finishedAt }
  if (
    'stats' in value &&
    value.stats &&
    typeof value.stats === 'object' &&
    'accounts' in value.stats &&
    'localTokens' in value.stats
  ) {
    const { accounts, localTokens } = value.stats
    if (
      typeof accounts === 'number' &&
      Number.isSafeInteger(accounts) &&
      accounts > 0 &&
      (localTokens === null ||
        (typeof localTokens === 'number' && Number.isSafeInteger(localTokens) && localTokens >= 0))
    )
      mission.stats = { accounts, localTokens }
  }
  return mission
}

export type UsageReport = {
  tiboReset?: TiboMission
  accounts: AccountReport[]
  rules: AlertRules
  /** Epoch ms when this report was worked out. Every time left counts from here. */
  readAt: number
}

const ORDER: Record<AlertLevel, number> = { critical: -1, urgent: 0, warning: 1, ok: 2 }

function reportWindow(window: UsageWindow, rules: RuleSet, now: number): WindowReport {
  const timeLeftPercent =
    window.resetsAt === null ? null : Math.min(100, Math.max(0, ((window.resetsAt - now) / window.lengthMs) * 100))
  const atRiskPercent = timeLeftPercent === null ? null : Math.max(0, leftPercent(window) - timeLeftPercent)
  return { ...window, alert: evaluateAlert(window, rules, now), timeLeftPercent, atRiskPercent, marks: [] }
}

/**
 * One mark per place on the bar; where rules share a place, the most severe one is shown.
 * A place the usage has already passed has no mark: that rule can no longer match in this window.
 */
function ruleMarks(rules: AlertRule[], kind: RuleKind, usedPercent: number): RuleMark[] {
  const byPlace = new Map<number, AlertRule>()
  for (const rule of rules) {
    const place = 100 - rule.minLeftPercent
    if (place < usedPercent) continue
    const shown = byPlace.get(place)
    if (!shown || isWorseRule(rule.level, shown.level)) byPlace.set(place, rule)
  }
  return [...byPlace]
    .map(([place, rule]) => ({ usedPercent: place, aheadPercent: place - usedPercent, rule, kind }))
    .sort((a, b) => a.usedPercent - b.usedPercent)
}

function advise(main: WindowReport | undefined, resetCount: number, now: number): Advice | null {
  if (!main || main.resetsAt === null || resetCount === 0) return null
  const left = leftPercent(main)
  const until = main.resetsAt - now
  if (left <= 0 || until <= 0) return null
  return { leftPercent: left, before: main.resetsAt, perDayPercent: until >= DAY ? left / (until / DAY) : null }
}

function reportAccount(usage: AccountUsage, allRules: AlertRules, now: number): AccountReport {
  const key = accountKey(usage)
  if (usage.status === 'unavailable') return { ...usage, key }
  const rules = rulesFor(allRules, key)
  const windows = usage.windows
    .map((window) => reportWindow(window, rules, now))
    .sort((a, b) => b.lengthMs - a.lengthMs)
  const main = windows[0]
  const mainKind = main && WINDOW_RULE_KIND[main.kind]
  if (main?.alert && mainKind) main.marks = ruleMarks(rules[mainKind], mainKind, main.usedPercent)
  const credits = usage.resetCredits
  // A reset has rules of its own: its expiry is the deadline, judged with the plan left like a window is.
  const resets = Array.from({ length: credits?.available ?? 0 }, (_, index): ResetReport => {
    const expiresAt = credits?.expiresAt[index] ?? null
    return {
      expiresAt,
      alert: main && expiresAt !== null ? judge(expiresAt - now, leftPercent(main), rules[RESET_RULE_KIND]) : null,
    }
  })
  const alerts = [...windows, ...resets].map((judged) => judged.alert?.level ?? 'ok')
  const { provider, account, status, plan, usagePage } = usage
  return {
    key,
    provider,
    account,
    status,
    plan,
    usagePage: usagePage ?? null,
    windows,
    resets,
    advice: advise(main, resets.length, now),
    level: alerts.reduce<AlertLevel>(worseLevel, 'ok'),
  }
}

function sortRank(account: AccountReport): number {
  return account.status === 'ok' ? ORDER[account.level] : ORDER.ok + 1
}

function isCodex(account: { provider: string }): boolean {
  return account.provider === 'Codex'
}

export function visibleAccounts(report: UsageReport): AccountReport[] {
  return report.tiboReset ? report.accounts.filter(isCodex) : report.accounts
}

export function weeklyUsage(accounts: AccountReport[]) {
  const readings = accounts.flatMap((account) => {
    const weekly = account.status === 'ok' && account.windows.find((window) => window.kind === 'weekly')
    return weekly ? [weekly.usedPercent] : []
  })
  return {
    complete:
      accounts.length > 0 && readings.length === accounts.length && readings.every((percent) => percent === 100),
    count: readings.length,
    percent: readings.length ? readings.reduce((sum, used) => sum + used, 0) / readings.length : null,
  }
}

const TIBO_RULES: AlertRules = {
  general: { plan: [{ withinMs: 7 * DAY, minLeftPercent: 0, level: 'critical' }], reset: [] },
  accounts: {},
}

export function buildReport(
  accounts: AccountUsage[],
  rules: AlertRules,
  now: number,
  tiboReset: TiboMission | null = null,
): UsageReport {
  const reported = accounts.map((usage) => reportAccount(usage, tiboReset && isCodex(usage) ? TIBO_RULES : rules, now))
  const report: UsageReport = {
    ...(tiboReset && { tiboReset }),
    accounts: reported.sort((a, b) => sortRank(a) - sortRank(b)),
    rules,
    readAt: now,
  }
  return report
}

/** Only a fresh read from the current mission can earn a reset ticket. */
export function recordCompletion(report: UsageReport) {
  const mission = report.tiboReset
  if (mission && mission.finishedAt === null && weeklyUsage(visibleAccounts(report)).complete) {
    report.tiboReset = {
      ...mission,
      finishedAt: Math.max(report.readAt, mission.startedAt),
      stats: { accounts: visibleAccounts(report).length, localTokens: null },
    }
  }
}

/** One account that needs spending now: what is about to be lost, and by when. */
export type SpendCall = {
  provider: string
  level: Exclude<AlertLevel, 'ok'>
  /** What the deadline is: the plan window resetting, or a rate limit reset expiring unredeemed. */
  deadline: 'window' | 'reset'
  /** How much of the plan is still there to spend. */
  leftPercent: number
  /** Epoch ms of the deadline. */
  by: number
}

function spendCall(account: AccountReport): SpendCall | null {
  if (account.status !== 'ok' || account.level === 'ok') return null
  const main = account.windows[0]
  if (!main) return null
  const { provider, level } = account
  const window = account.windows.find((judged) => judged.alert?.level === level && judged.resetsAt !== null)
  if (window?.resetsAt != null) {
    return { provider, level, deadline: 'window', leftPercent: leftPercent(window), by: window.resetsAt }
  }
  const expiries = account.resets.flatMap((reset) =>
    reset.alert?.level === level && reset.expiresAt !== null ? [reset.expiresAt] : [],
  )
  if (expiries.length === 0) return null
  return { provider, level, deadline: 'reset', leftPercent: leftPercent(main), by: Math.min(...expiries) }
}

/** Every account that needs spending, most pressing first: worst level, then the soonest deadline. */
export function spendCalls(report: UsageReport): SpendCall[] {
  return visibleAccounts(report)
    .flatMap((account) => spendCall(account) ?? [])
    .sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.by - b.by)
}
