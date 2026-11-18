// What the worker does, given its usage sources: answer the panel, re-read on a timer and keep
// the status bar item on the most pressing window. It never names a provider.
import type { OrcaWorkerApi } from 'orca/worker'
import { DEFAULT_ALERT_RULES, parseAlertRules, type AlertRule } from './core/alerts'
import { buildReport, type UsageReport } from './core/report'
import { readAllUsage, type UsageSource } from './core/usage'
import { statusBarView } from './status-bar'
import './protocol'

const STATUS_BAR_ITEM = 'unused-plan'
const RULES_KEY = 'alertRules'
const POLL_MS = 10 * 60 * 1000

/** Starts the worker's behavior and returns the function that stops it. */
export function start(orca: OrcaWorkerApi, sources: Record<string, UsageSource>): () => void {
  /** The person's rules; the built-in ones until they save their own. */
  async function storedRules(): Promise<AlertRule[]> {
    const stored = await orca.storage.get(RULES_KEY)
    if (stored === null || stored === undefined) return DEFAULT_ALERT_RULES
    const rules = parseAlertRules(stored)
    if (!rules) throw new Error('The saved alert rules are not valid. Save them again from the panel.')
    return rules
  }

  async function refresh(): Promise<UsageReport> {
    const [accounts, rules] = await Promise.all([readAllUsage(sources), storedRules()])
    const report = buildReport(accounts, rules, Date.now())
    orca.panels.post('usage.changed', report)
    await orca.host.call('statusBar.update', { id: STATUS_BAR_ITEM, visible: true, ...statusBarView(report) })
    return report
  }
  const refreshInBackground = (): void => {
    refresh().catch((error: unknown) => orca.log(`Usage refresh failed: ${String(error)}`))
  }

  orca.panels.handle('usage.read', refresh)
  orca.panels.handle('rules.save', async (input) => {
    const rules = parseAlertRules(input.rules)
    if (!rules) throw new Error('Those alert rules are not valid.')
    await orca.storage.set(RULES_KEY, rules)
    return refresh()
  })
  // Unreferenced: the timer alone must not keep a process alive (a test that fails before stopping it).
  const timer = setInterval(refreshInBackground, POLL_MS).unref()
  refreshInBackground()
  return () => clearInterval(timer)
}
