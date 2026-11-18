// What the panel and the status bar show: every account's usage with its alerts, worst first.
import { evaluateAlert, worseLevel, type Alert, type AlertLevel, type AlertRule } from './alerts'
import { leftPercent, type AccountUsage, type UsageWindow } from './usage'

export type WindowReport = UsageWindow & { alert: Alert | null }

type OkUsage = Extract<AccountUsage, { status: 'ok' }>
type UnavailableUsage = Extract<AccountUsage, { status: 'unavailable' }>

export type AccountReport =
  (Omit<OkUsage, 'windows'> & { windows: WindowReport[]; level: AlertLevel }) | UnavailableUsage

export type UsageReport = {
  accounts: AccountReport[]
  rules: AlertRule[]
  /** Epoch ms when the providers were read. */
  readAt: number
}

const ORDER: Record<AlertLevel, number> = { urgent: 0, warning: 1, ok: 2 }

function reportAccount(usage: AccountUsage, rules: AlertRule[], now: number): AccountReport {
  if (usage.status === 'unavailable') return usage
  const windows = usage.windows.map((window) => ({ ...window, alert: evaluateAlert(window, rules, now) }))
  const level = windows.reduce<AlertLevel>((worst, window) => worseLevel(worst, window.alert?.level ?? 'ok'), 'ok')
  return { ...usage, windows, level }
}

function sortRank(account: AccountReport): number {
  return account.status === 'ok' ? ORDER[account.level] : ORDER.ok + 1
}

export function buildReport(accounts: AccountUsage[], rules: AlertRule[], now: number): UsageReport {
  const reported = accounts.map((usage) => reportAccount(usage, rules, now))
  return { accounts: reported.sort((a, b) => sortRank(a) - sortRank(b)), rules, readAt: now }
}

export type Headline = { provider: string; leftPercent: number; level: AlertLevel; resetsAt: number }

/** The most pressing judged window: worst alert first, then the soonest reset. Null when none is judged. */
export function headline(report: UsageReport): Headline | null {
  let best: Headline | null = null
  for (const account of report.accounts) {
    if (account.status !== 'ok') continue
    for (const window of account.windows) {
      if (!window.alert || window.resetsAt === null) continue
      const { level } = window.alert
      const candidate = {
        provider: account.provider,
        leftPercent: leftPercent(window),
        level,
        resetsAt: window.resetsAt,
      }
      const beats =
        !best || ORDER[level] < ORDER[best.level] || (level === best.level && candidate.resetsAt < best.resetsAt)
      if (beats) best = candidate
    }
  }
  return best
}
