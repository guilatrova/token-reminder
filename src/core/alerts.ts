// "Use it or lose it": an alert fires when a reset is close and much of the plan is still unused.
import { leftPercent, type UsageWindow, type WindowKind } from './usage'

import { DEFAULT_ALERT_RULES } from './alert-defaults'
export { DEFAULT_ALERT_RULES } from './alert-defaults'

export type AlertLevel = 'ok' | 'warning' | 'urgent'

/** `mark` only draws the rule on the bar, as a spend to aim for; it never alerts. */
export type RuleLevel = 'mark' | Exclude<AlertLevel, 'ok'>

export type AlertRule = {
  /** Fires when the deadline is at most this far away. */
  withinMs: number
  /** ...and at least this much of the plan is still unused. */
  minLeftPercent: number
  level: RuleLevel
}

/** What a rule's deadline is: the `plan` window resetting, or a rate limit `reset` expiring unredeemed. */
export const RULE_KINDS = ['plan', 'reset'] as const
export type RuleKind = (typeof RULE_KINDS)[number]
export type RuleSet = Record<RuleKind, AlertRule[]>

export type AlertRules = {
  general: RuleSet
  /** By account key. A kind an account has replaces the general one for it; a kind it lacks follows general. */
  accounts: Record<string, Partial<RuleSet>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAlertRule(value: unknown): value is AlertRule {
  if (!isRecord(value)) return false
  const { withinMs, minLeftPercent, level } = value
  const within = typeof withinMs === 'number' && Number.isFinite(withinMs) && withinMs > 0
  const left = typeof minLeftPercent === 'number' && minLeftPercent >= 0 && minLeftPercent <= 100
  return within && left && (level === 'mark' || level === 'warning' || level === 'urgent')
}

function isRuleList(value: unknown): value is AlertRule[] {
  return Array.isArray(value) && value.every(isAlertRule)
}

/** A rule set where every kind present is a valid list; `complete` also wants every kind present. */
function parseRuleSet(value: unknown, complete: boolean): Partial<RuleSet> | null {
  if (!isRecord(value)) return null
  const set: Partial<RuleSet> = {}
  for (const kind of RULE_KINDS) {
    const list = value[kind]
    if (list === undefined && !complete) continue
    if (!isRuleList(list)) return null
    set[kind] = list
  }
  return set
}

/** Rules as they come from storage or a request; null when the value is not valid. */
export function parseAlertRules(value: unknown): AlertRules | null {
  // Before rules had kinds and accounts, the saved value was the list of general plan rules.
  if (isRuleList(value)) return { ...DEFAULT_ALERT_RULES, general: { ...DEFAULT_ALERT_RULES.general, plan: value } }
  if (!isRecord(value) || !isRecord(value.accounts)) return null
  const general = parseRuleSet(value.general, true)
  if (!general) return null
  const accounts: AlertRules['accounts'] = {}
  for (const [key, own] of Object.entries(value.accounts)) {
    const set = parseRuleSet(own, false)
    if (!set) return null
    accounts[key] = set
  }
  return { general: general as RuleSet, accounts }
}

/** The rules one account is judged by. */
export function rulesFor(rules: AlertRules, accountKey: string): RuleSet {
  const own = rules.accounts[accountKey]
  return Object.fromEntries(RULE_KINDS.map((kind) => [kind, own?.[kind] ?? rules.general[kind]])) as RuleSet
}

/**
 * The rules with one list replaced: the general one when `accountKey` is null, otherwise that account's own.
 * A null list makes the account follow general again; the general list cannot be null.
 */
export function withRuleList(
  rules: AlertRules,
  accountKey: string | null,
  kind: RuleKind,
  list: AlertRule[] | null,
): AlertRules {
  if (accountKey === null) {
    if (list === null) throw new Error('The general rules cannot follow anything.')
    return { ...rules, general: { ...rules.general, [kind]: list } }
  }
  const own: Partial<RuleSet> = { ...rules.accounts[accountKey] }
  if (list === null) delete own[kind]
  else own[kind] = list
  const accounts = { ...rules.accounts }
  if (Object.keys(own).length === 0) delete accounts[accountKey]
  else accounts[accountKey] = own
  return { ...rules, accounts }
}

/**
 * Which rules judge each kind of window. A kind that is absent is not judged: the session window
 * resets every few hours, so losing its leftover is routine, not news.
 */
export const WINDOW_RULE_KIND: Partial<Record<WindowKind, RuleKind>> = { weekly: 'plan', monthly: 'plan' }

/** Which rules judge a rate limit reset by its expiry. */
export const RESET_RULE_KIND: RuleKind = 'reset'

const SEVERITY: Record<AlertLevel | RuleLevel, number> = { ok: 0, mark: 0, warning: 1, urgent: 2 }

export type Alert = { level: AlertLevel; rule: AlertRule | null }

export function worseLevel(a: AlertLevel, b: AlertLevel): AlertLevel {
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}

/** The worst rule a deadline matches: how close it is, and how much of the plan is still unused. */
export function judge(untilMs: number, leftPercent: number, rules: AlertRule[]): Alert {
  let worst: Alert = { level: 'ok', rule: null }
  for (const rule of rules) {
    if (rule.level === 'mark') continue
    const matches = untilMs <= rule.withinMs && leftPercent >= rule.minLeftPercent
    if (matches && SEVERITY[rule.level] > SEVERITY[worst.level]) worst = { level: rule.level, rule }
  }
  return worst
}

/** Null when the window is not judged: an untracked kind, or a reset time nobody reported. */
export function evaluateAlert(window: UsageWindow, rules: RuleSet, now: number): Alert | null {
  const kind = WINDOW_RULE_KIND[window.kind]
  if (kind === undefined || window.resetsAt === null) return null
  return judge(window.resetsAt - now, leftPercent(window), rules[kind])
}

/** "2d", "10h", "1d 4h": the two largest units, enough for a rule or a tooltip. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  const parts = [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean)
  return parts.slice(0, 2).join(' ') || '0m'
}

/** What each kind of rule counts down to, as a rule's sentence says it. */
export const RULE_DEADLINE: Record<RuleKind, string> = { plan: 'to reset', reset: 'to expire' }

/** "≤ 2d to reset, ≥ 50% left": a rule as the settings spell it. */
export function describeRule(rule: AlertRule, kind: RuleKind): string {
  return `≤ ${formatDuration(rule.withinMs)} ${RULE_DEADLINE[kind]}, ≥ ${rule.minLeftPercent}% left`
}

/** Whether `a` is the more severe rule level; a mark is the least. */
export function isWorseRule(a: RuleLevel, b: RuleLevel): boolean {
  return SEVERITY[a] > SEVERITY[b]
}
