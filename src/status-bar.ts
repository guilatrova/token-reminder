// What the status bar item says about a report: one line for the most pressing window, and
// every account in the tooltip.
import { formatDuration } from './core/alerts'
import { headline, type AccountReport, type UsageReport, type WindowReport } from './core/report'
import { leftPercent } from './core/usage'
import { LEVEL_LABEL, LEVEL_TONE, WINDOW_LABEL } from './tones'

export type StatusBarView = { text: string; tone: 'neutral' | 'warning' | 'danger'; tooltip: string }

function untilText(at: number | null, now: number): string {
  return at === null ? 'unknown' : formatDuration(at - now)
}

function windowLine(window: WindowReport, now: number): string {
  const alert = window.alert ? ` (${LEVEL_LABEL[window.alert.level]})` : ''
  const left = Math.round(leftPercent(window))
  return `${WINDOW_LABEL[window.kind]}: ${left}% left, resets in ${untilText(window.resetsAt, now)}${alert}`
}

function accountLines(account: AccountReport, now: number): string[] {
  const name = [account.provider, account.account].filter(Boolean).join(' ')
  if (account.status === 'unavailable') return [`${name}: unavailable. ${account.detail}`]
  const lines = account.windows.map((window) => windowLine(window, now))
  const credits = account.resetCredits
  if (credits && credits.available > 0) {
    lines.push(
      `Resets available: ${credits.available}, next expires in ${untilText(credits.expiresAt[0] ?? null, now)}`,
    )
  }
  return [account.plan ? `${name} (${account.plan})` : name, ...lines.map((line) => `  ${line}`)]
}

export function statusBarView(report: UsageReport): StatusBarView {
  const now = report.readAt
  const tooltip = report.accounts.flatMap((account) => accountLines(account, now)).join('\n')
  const top = headline(report)
  if (!top) {
    const text = report.accounts.length === 0 ? 'No accounts' : 'Usage unavailable'
    return { text, tone: 'neutral', tooltip: tooltip || 'No account managed by Orca was found.' }
  }
  const text = `${top.provider} ${Math.round(top.leftPercent)}% left · ${formatDuration(top.resetsAt - now)}`
  // On track stays neutral so the item blends in until something needs spending.
  return { text, tone: top.level === 'ok' ? 'neutral' : LEVEL_TONE[top.level], tooltip }
}
