// Wires the panel to Orca: asks the worker for the report, keeps the state, and redraws on every change.
import '../protocol'
import type { AlertRule } from '../core/alerts'
import type { UsageReport } from '../core/report'
import { panelView, type Actions, type PanelState } from './view'

const root = document.getElementById('root')
if (!root) throw new Error('The panel page has no #root element.')

const state: PanelState = {
  report: null,
  loading: true,
  error: null,
  view: 'accounts',
  opened: new Map(),
  animate: true,
}

function render() {
  const active = document.activeElement
  const focusKey = active instanceof HTMLElement ? active.dataset.focus : undefined
  root?.replaceChildren(panelView(state, actions, orca.locale))
  if (state.report && state.view === 'accounts') state.animate = false
  if (focusKey) root?.querySelector<HTMLElement>(`[data-focus="${focusKey}"]`)?.focus()
}

async function run(request: () => Promise<UsageReport>) {
  state.loading = true
  render()
  try {
    state.report = await request()
    state.error = null
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
  }
  state.loading = false
  render()
}

const actions: Actions = {
  refresh: () => run(() => orca.plugin.request('usage.read')),
  saveRules: (rules: AlertRule[]) => run(() => orca.plugin.request('rules.save', { rules })),
  showRules: () => {
    state.view = 'rules'
    render()
  },
  showAccounts: () => {
    state.view = 'accounts'
    render()
  },
  toggle: (key, open) => state.opened.set(key, open),
}

orca.plugin.on('usage.changed', (report) => {
  state.report = report
  state.error = null
  render()
})

await actions.refresh()
