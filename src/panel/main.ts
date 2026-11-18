// Wires the panel to Orca: asks the worker for the report, keeps the state, and redraws on every change.
import '../protocol'
import type { AlertRules } from '../core/alerts'
import type { Preferences } from '../preferences'
import type { UsageReport } from '../core/report'
import { panelView, type Actions, type PanelState } from './view'

const AUTHOR_URL = 'https://github.com/guilatrova'

const root = document.getElementById('root')
if (!root) throw new Error('The panel page has no #root element.')

const state: PanelState = {
  report: null,
  preferences: null,
  loading: true,
  error: null,
  view: 'accounts',
  scope: null,
  opened: new Map(),
  animate: true,
}

function render() {
  const active = document.activeElement
  const focusKey = active instanceof HTMLElement ? active.dataset.focus : undefined
  root?.replaceChildren(panelView(state, actions, orca.locale))
  if (state.report && state.view === 'accounts') state.animate = false
  if (focusKey) root?.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus()
}

/** Asks the worker for something and keeps the answer; a failure leaves what was on screen and says why. */
let pending = 0

async function run<T>(request: () => Promise<T>, keep: (answer: T) => void) {
  pending++
  state.loading = true
  // Cleared when a request starts, not when one succeeds: another request's failure must stay on screen.
  state.error = null
  render()
  try {
    keep(await request())
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  }
  pending--
  state.loading = pending > 0
  render()
}

const keepReport = (report: UsageReport) => void (state.report = report)
const keepPreferences = (preferences: Preferences) => void (state.preferences = preferences)

const actions: Actions = {
  refresh: () => run(() => orca.plugin.request('usage.read'), keepReport),
  saveRules: (rules: AlertRules) => run(() => orca.plugin.request('rules.save', { rules }), keepReport),
  savePreferences: (preferences: Preferences) =>
    run(() => orca.plugin.request('preferences.save', preferences), keepPreferences),
  showScope: (accountKey) => {
    state.scope = accountKey
    render()
  },
  showSettings: () => {
    state.view = 'settings'
    render()
  },
  showAccounts: () => {
    state.view = 'accounts'
    render()
  },
  toggle: (key, open) => state.opened.set(key, open),
  // Orca opens it in the system browser, asking the person first for a site this plugin has not opened before.
  openCredit: orca.shell ? () => void orca.shell?.openExternal(AUTHOR_URL) : null,
}

orca.plugin.on('usage.changed', (report) => {
  state.report = report
  state.error = null
  render()
})

// The worker answers from its last read, so opening the tab does not ask the providers again.
await Promise.all([
  run(() => orca.plugin.request('usage.latest'), keepReport),
  run(() => orca.plugin.request('preferences.read'), keepPreferences),
])
