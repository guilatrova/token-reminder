// What opens under an account row: the pace bar, a note, every deadline, and the advice.
import type { AlertLevel } from '../core/alerts'
import type { Advice, OkAccountReport, WindowReport } from '../core/report'
import { leftPercent } from '../core/usage'
import { WINDOW_LABEL } from '../tones'
import { el, icon } from './dom'
import { percent, shortDate, timeLeft, type ViewContext } from './format'
import { paceBar } from './pace-bar'

function deadline(label: string, level: AlertLevel, at: number | null, ctx: ViewContext): HTMLElement {
  const date = at === null ? 'unknown' : shortDate(at, ctx.locale)
  const left = at === null ? '' : timeLeft(at, ctx.readAt)
  return el('div', `line lvl-${level}`, el('i', ''), el('span', '', label), el('span', 'date', date), el('b', '', left))
}

function windowLine(window: WindowReport, isMain: boolean, ctx: ViewContext): HTMLElement {
  const base = `${WINDOW_LABEL[window.kind]} limit resets`
  const label = isMain ? base : `${base} · ${percent(leftPercent(window))} left`
  return deadline(label, window.alert?.level ?? 'ok', window.resetsAt, ctx)
}

function note(main: WindowReport): HTMLElement | null {
  if (main.atRiskPercent === null || Math.round(main.atRiskPercent) < 1) return null
  const alerting = main.alert !== null && main.alert.level !== 'ok'
  const text = alerting ? 'about to go unused' : 'may go unused'
  return el('div', alerting ? 'note hot' : 'note', `~${percent(main.atRiskPercent)} ${text}`)
}

function adviceView(advice: Advice, ctx: ViewContext): HTMLElement {
  const pace = advice.perDayPercent === null ? '' : ` That is about ${percent(advice.perDayPercent)} a day.`
  const text = `Use the ${percent(advice.leftPercent)} before ${shortDate(advice.before, ctx.locale)} and you can cash in a reset.${pace}`
  return el('div', 'advice', icon('bulb'), el('span', '', text))
}

export function accountDetail(account: OkAccountReport, ctx: ViewContext): HTMLElement {
  const inner = el('div', 'inner')
  if (account.account) inner.append(el('div', 'who-email', account.account))
  const [main, ...others] = account.windows
  if (!main) {
    inner.append(el('div', 'note', 'This plan reports no usage window.'))
    return el('div', 'detail', el('div', 'clip', inner))
  }
  const lines = el(
    'div',
    'lines',
    windowLine(main, true, ctx),
    ...others.map((window) => windowLine(window, false, ctx)),
    ...account.resets.map((reset) => {
      const level = reset.alert?.level ?? 'ok'
      return deadline(level === 'ok' ? 'Reset expires' : 'Reset expires unused', level, reset.expiresAt, ctx)
    }),
  )
  inner.append(paceBar(main, true, ctx.animate), note(main) ?? '', lines)
  if (account.advice) inner.append(adviceView(account.advice, ctx))
  return el('div', 'detail', el('div', 'clip', inner))
}
