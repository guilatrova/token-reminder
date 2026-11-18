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
  key: string
  /** Longest window first: the first one is the plan period and drives the account's summary. */
  windows: WindowReport[]
  resets: ResetReport[]
  advice: Advice | null
  /** The worst alert among the windows and the resets. */
  level: AlertLevel
}

export type AccountReport = OkAccountReport | (UnavailableUsage & { key: string })

export type UsageReport = {
  accounts: AccountReport[]
  rules: AlertRules
  /** Epoch ms when this report was worked out. Every time left counts from here. */
  readAt: number
}

const ORDER: Record<AlertLevel, number> = { urgent: 0, warning: 1, ok: 2 }

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
  const { provider, account, status, plan } = usage
  return {
    key,
    provider,
    account,
    status,
    plan,
    windows,
    resets,
    advice: advise(main, resets.length, now),
    level: alerts.reduce<AlertLevel>(worseLevel, 'ok'),
  }
}

function sortRank(account: AccountReport): number {
  return account.status === 'ok' ? ORDER[account.level] : ORDER.ok + 1
}

export function buildReport(accounts: AccountUsage[], rules: AlertRules, now: number): UsageReport {
  const reported = accounts.map((usage) => reportAccount(usage, rules, now))
  return { accounts: reported.sort((a, b) => sortRank(a) - sortRank(b)), rules, readAt: now }
}

export type Headline = {
  provider: string
  leftPercent: number
  level: AlertLevel
  resetsAt: number
  /** Epoch ms of the soonest reset behind the account's level, when a reset and not the plan window is behind it. */
  expiringReset: number | null
}

/** The reset that explains an account's level, when its main window alone does not. */
function expiringReset(account: OkAccountReport, main: WindowReport): number | null {
  if (account.level === 'ok' || main.alert?.level === account.level) return null
  const expiries = account.resets.flatMap((reset) =>
    reset.alert?.level === account.level && reset.expiresAt !== null ? [reset.expiresAt] : [],
  )
  return expiries.length ? Math.min(...expiries) : null
}

/** The most pressing account by its main window: worst level first, then the soonest reset. */
export function headline(report: UsageReport): Headline | null {
  let best: Headline | null = null
  for (const account of report.accounts) {
    const main = account.status === 'ok' ? account.windows[0] : undefined
    if (account.status !== 'ok' || !main || main.resetsAt === null) continue
    const candidate = {
      provider: account.provider,
      leftPercent: leftPercent(main),
      level: account.level,
      resetsAt: main.resetsAt,
      expiringReset: expiringReset(account, main),
    }
    const beats =
      !best ||
      ORDER[candidate.level] < ORDER[best.level] ||
      (candidate.level === best.level && candidate.resetsAt < best.resetsAt)
    if (beats) best = candidate
  }
  return best
}
