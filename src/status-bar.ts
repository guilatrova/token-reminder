// What the status bar item says about a report: the most pressing window as its text, and
// every deadline of every account in the tooltip.
import { formatDuration } from './core/alerts'
import { headline, type AccountReport, type UsageReport, type WindowReport } from './core/report'
import { leftPercent } from './core/usage'
import { LEVEL_LABEL, LEVEL_TONE, WINDOW_LABEL } from './tones'

export type StatusBarView = { text: string; tone: 'neutral' | 'warning' | 'danger'; tooltip: string }

/** "6d 4h (Nov 24)": how long until a deadline, and its day. */
function deadlineText(at: number | null, now: number): string {
  if (at === null) return 'unknown'
  const day = new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${formatDuration(at - now)} (${day})`
}

function windowText(window: WindowReport, now: number): string {
  const urgency = window.alert && window.alert.level !== 'ok' ? `, ${LEVEL_LABEL[window.alert.level]}` : ''
  const left = Math.round(leftPercent(window))
  return `${WINDOW_LABEL[window.kind]} ${left}% left, ${deadlineText(window.resetsAt, now)}${urgency}`
}

/** Orca draws a tooltip as one flowing paragraph, so each account is a single sentence. */
function accountText(account: AccountReport, now: number): string {
  if (account.status === 'unavailable') return `${account.provider}: unavailable. ${account.detail}`
  const credits = account.resetCredits
  const resets = Array.from(
    { length: credits?.available ?? 0 },
    (_, index) => `Reset ${deadlineText(credits?.expiresAt[index] ?? null, now)}`,
  )
  const parts = [...account.windows.map((window) => windowText(window, now)), ...resets]
  return `${[account.provider, account.plan].filter(Boolean).join(' ')}: ${parts.join(' · ')}`
}

export function statusBarView(report: UsageReport): StatusBarView {
  const now = report.readAt
  const tooltip = report.accounts.map((account) => accountText(account, now)).join(' | ')
  const top = headline(report)
  if (!top) {
    const text = report.accounts.length === 0 ? 'No accounts' : 'Usage unavailable'
    return { text, tone: 'neutral', tooltip: tooltip || 'No account managed by Orca was found.' }
  }
  const text = `${top.provider} ${Math.round(top.leftPercent)}% left · ${formatDuration(top.resetsAt - now)}`
  // On track stays neutral so the item blends in until something needs spending.
  return { text, tone: top.level === 'ok' ? 'neutral' : LEVEL_TONE[top.level], tooltip }
}
