// What the status bar item says about a report. It speaks only when something needs spending:
// the most pressing account as its text, and every account that needs spending in the tooltip.
import { formatDuration } from './core/alerts'
import { spendCalls, type SpendCall, type UsageReport } from './core/report'
import { LEVEL_TONE } from './tones'

export type StatusBarView = { text: string; tone: 'warning' | 'danger'; tooltip: string }

/** "Grok: spend 74%", or "Codex: use a reset" when a rate limit reset is what is about to be lost. */
function ask(call: SpendCall): string {
  const what = call.deadline === 'window' ? `spend ${Math.round(call.leftPercent)}%` : 'use a reset'
  return `${call.provider}: ${what}`
}

/** "Grok: spend 74% by Thu, Nov 19 (20h)". */
function sentence(call: SpendCall, now: number): string {
  const day = new Date(call.by).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return `${ask(call)} by ${day} (${formatDuration(call.by - now)})`
}

/** Null when every account is on track: the item then has nothing to say and stays out of the way. */
export function statusBarView(report: UsageReport): StatusBarView | null {
  const now = report.readAt
  const calls = spendCalls(report)
  const [top, ...others] = calls
  if (!top) return null
  const more = others.length ? ` · +${others.length}` : ''
  return {
    text: `${ask(top)} in ${formatDuration(top.by - now)}${more}`,
    tone: LEVEL_TONE[top.level],
    // Orca draws a tooltip as one flowing paragraph, so the accounts are set apart by a dot, not a line break.
    tooltip: calls.map((call) => sentence(call, now)).join('  ·  '),
  }
}
