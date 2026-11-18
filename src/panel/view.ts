// Turns the panel's state into DOM. Pure: it never calls Orca, the callbacks do.
import type { AlertRule } from '../core/alerts'
import type { UsageReport } from '../core/report'
import { accountRow } from './account-row'
import { el, iconButton } from './dom'
import { updatedText, type ViewContext } from './format'
import { rulesView } from './rules-view'

export type PanelState = {
  report: UsageReport | null
  loading: boolean
  error: string | null
  view: 'accounts' | 'rules'
  /** The person's own open and close choices; a missing key means "open when the account needs spending". */
  opened: Map<string, boolean>
  /** True until a report has been drawn once, so refreshes do not replay the bar animation. */
  animate: boolean
}

export type Actions = {
  refresh: () => void
  showRules: () => void
  showAccounts: () => void
  saveRules: (rules: AlertRule[]) => void
  toggle: (key: string, open: boolean) => void
}

function footer(state: PanelState, report: UsageReport, actions: Actions): HTMLElement {
  const refresh = iconButton('Refresh', 'refresh', 'refresh', actions.refresh)
  refresh.disabled = state.loading
  refresh.classList.toggle('spinning', state.loading)
  const status =
    state.error === null
      ? el('span', 'updated', updatedText(report.readAt, Date.now()))
      : el('span', 'footer-error', state.error)
  return el(
    'div',
    'footer',
    status,
    el('span', 'tools', iconButton('Alert rules', 'gear', 'gear', actions.showRules), refresh),
  )
}

function accountsView(state: PanelState, report: UsageReport, actions: Actions, locale: string): HTMLElement {
  const ctx: ViewContext = {
    locale,
    readAt: report.readAt,
    animate: state.animate,
    opened: state.opened,
    onToggle: actions.toggle,
  }
  const list =
    report.accounts.length === 0
      ? el(
          'div',
          'empty',
          el('p', 'empty-title', 'No accounts yet'),
          el('p', 'muted', 'Add an account in Orca and it shows up here.'),
        )
      : el('div', 'accounts', ...report.accounts.map((account) => accountRow(account, ctx)))
  return el('div', 'panel', list, footer(state, report, actions))
}

function failedView(error: string, actions: Actions): HTMLElement {
  const retry = el('button', 'btn', 'Try again')
  retry.type = 'button'
  retry.addEventListener('click', actions.refresh)
  return el('div', 'panel', el('p', 'error', error), retry)
}

export function panelView(state: PanelState, actions: Actions, locale: string): HTMLElement {
  const { report } = state
  if (!report) {
    if (state.loading || state.error === null) return el('p', 'panel muted', 'Reading usage…')
    return failedView(state.error, actions)
  }
  if (state.view === 'rules') return rulesView(report.rules, state.error, actions.saveRules, actions.showAccounts)
  return accountsView(state, report, actions, locale)
}
