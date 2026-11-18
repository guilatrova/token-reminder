// "Use it or lose it": an alert fires when a reset is close and much of the plan is still unused.
import { leftPercent, type UsageWindow, type WindowKind } from './usage'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export type AlertLevel = 'ok' | 'warning' | 'urgent'

export type AlertRule = {
  /** Fires when the reset is at most this far away. */
  withinMs: number
  /** ...and at least this much of the window is still unused. */
  minLeftPercent: number
  level: Exclude<AlertLevel, 'ok'>
}

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  { withinMs: 2 * DAY, minLeftPercent: 50, level: 'warning' },
  { withinMs: DAY, minLeftPercent: 70, level: 'urgent' },
  { withinMs: 10 * HOUR, minLeftPercent: 90, level: 'urgent' },
]

function isAlertRule(value: unknown): value is AlertRule {
  if (typeof value !== 'object' || value === null) return false
  const { withinMs, minLeftPercent, level } = value as Record<string, unknown>
  const within = typeof withinMs === 'number' && Number.isFinite(withinMs) && withinMs > 0
  const left = typeof minLeftPercent === 'number' && minLeftPercent >= 0 && minLeftPercent <= 100
  return within && left && (level === 'warning' || level === 'urgent')
}

/** Rules as they come from storage or a request; null when the value is not a list of valid rules. */
export function parseAlertRules(value: unknown): AlertRule[] | null {
  return Array.isArray(value) && value.every(isAlertRule) ? value : null
}

/** The session window resets every few hours, so losing its leftover is routine, not news. */
const TRACKED_KINDS: WindowKind[] = ['weekly', 'monthly']

const SEVERITY: Record<AlertLevel, number> = { ok: 0, warning: 1, urgent: 2 }

export type Alert = { level: AlertLevel; rule: AlertRule | null }

export function worseLevel(a: AlertLevel, b: AlertLevel): AlertLevel {
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}

/** Null when the window is not judged: an untracked kind, or a reset time nobody reported. */
export function evaluateAlert(window: UsageWindow, rules: AlertRule[], now: number): Alert | null {
  if (!TRACKED_KINDS.includes(window.kind) || window.resetsAt === null) return null
  const untilReset = window.resetsAt - now
  const left = leftPercent(window)
  let worst: Alert = { level: 'ok', rule: null }
  for (const rule of rules) {
    const matches = untilReset <= rule.withinMs && left >= rule.minLeftPercent
    if (matches && SEVERITY[rule.level] > SEVERITY[worst.level]) worst = { level: rule.level, rule }
  }
  return worst
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

export function describeRule(rule: AlertRule): string {
  return `${formatDuration(rule.withinMs)} or less to reset with ${rule.minLeftPercent}% or more left`
}
