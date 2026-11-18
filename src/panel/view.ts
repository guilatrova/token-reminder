// Turns the panel's state into DOM. Pure: it never calls Orca, the callbacks do.
import { visibleAccounts, weeklyUsage, type UsageReport } from '../core/report'
import type { Preferences } from '../preferences'
import { accountRow } from './account-row'
import { el, iconButton } from './dom'
import type { ViewContext } from './format'
import { settingsView, type SettingsActions } from './settings-view'

import { tiboMenu, tiboPost } from './tibo-view'

export type PanelState = {
  report: UsageReport | null
  /** Null until the worker has answered them. */
  preferences: Preferences | null
  loading: boolean
  error: string | null
  view: 'accounts' | 'settings'
  /** Whose alert rules the settings show: an account's key, or null for the general ones. */
  scope: string | null
  /** The person's own open and close choices; a missing key means "open when the account needs spending". */
  opened: Map<string, boolean>
  /** True until a report has been drawn once, so refreshes do not replay the bar animation. */
  animate: boolean
}

export type Actions = SettingsActions & {
  setTibo: (active: boolean) => void
  refresh: () => void
  showSettings: () => void
  /** Opens a page in the browser; null where Orca cannot open links (browser clients). */
  openExternal: ((url: string) => void) | null
  toggle: (key: string, open: boolean) => void
}

/** The first line: settings and refresh on the right, and why the last read failed, if it did, on the left. */
function toolbar(state: PanelState, actions: Actions): HTMLElement {
  const active = !!state.report?.tiboReset
  const refresh = iconButton('Refresh', 'refresh', 'refresh', actions.refresh)
  refresh.disabled = state.loading
  refresh.classList.toggle('spinning', state.loading)
  return el(
    'div',
    'toolbar',
    el('span', 'toolbar-error', state.error ?? ''),
    el(
      'span',
      'tools',
      tiboMenu(active, actions.setTibo),
      iconButton('Settings', 'gear', 'gear', actions.showSettings),
      refresh,
    ),
  )
}

const AUTHOR_URL = 'https://github.com/guilatrova'

function credit(actions: Actions): HTMLElement | string {
  const open = actions.openExternal
  if (!open) return ''
  const link = el('button', 'credit', 'Who created this?')
  link.type = 'button'
  link.dataset.focus = 'credit'
  link.addEventListener('click', () => open(AUTHOR_URL))
  return link
}

function accountsView(state: PanelState, report: UsageReport, actions: Actions, locale: string): HTMLElement {
  const ctx: ViewContext = {
    locale,
    readAt: report.readAt,
    animate: state.animate,
    opened: state.opened,
    onToggle: actions.toggle,
    openExternal: actions.openExternal,
  }
  const accounts = visibleAccounts(report)
  const banner = report.tiboReset
    ? tiboPost(weeklyUsage(accounts), accounts.length, report.tiboReset, actions.openExternal)
    : ''
  const list =
    accounts.length === 0
      ? el(
          'div',
          'empty',
          el('p', 'empty-title', report.tiboReset ? 'No Codex accounts yet' : 'No accounts yet'),
          el('p', 'muted', 'Add an account in Orca and it shows up here.'),
        )
      : el('div', 'accounts', ...accounts.map((account) => accountRow(account, ctx)))
  return el('div', 'panel', toolbar(state, actions), banner, list, credit(actions))
}

/** Placeholder rows in the shape of the account list, so the panel does not jump when the report arrives. */
function loadingView(): HTMLElement {
  const row = (nameWidth: string) => {
    const name = el('i', 'bone')
    name.style.width = nameWidth
    return el(
      'div',
      'row skeleton',
      el('i', 'bone avatar-bone'),
      name,
      el('i', 'bone bar-bone'),
      el('i', 'bone'),
      el('i', 'bone'),
    )
  }
  const list = el('div', 'accounts', ...['64px', '48px', '56px'].map((width) => el('section', 'acct', row(width))))
  list.setAttribute('role', 'status')
  list.setAttribute('aria-label', 'Reading usage…')
  return el('div', 'panel', list)
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
    if (state.loading || state.error === null) return loadingView()
    return failedView(state.error, actions)
  }
  if (state.view === 'settings') return settingsView(report, state.preferences, state.scope, state.error, actions)
  return accountsView(state, report, actions, locale)
}
