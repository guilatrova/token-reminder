// What the worker does, given its usage sources: answer the panel, re-read on a timer and keep
// the status bar item on the most pressing window. It never names a provider.
import type { OrcaWorkerApi } from 'orca/worker'
import { DEFAULT_ALERT_RULES } from './core/alerts'
import { buildReport, type UsageReport } from './core/report'
import { readAllUsage, type UsageSource } from './core/usage'
import { statusBarView } from './status-bar'
import './protocol'

const STATUS_BAR_ITEM = 'unused-plan'
const POLL_MS = 10 * 60 * 1000

/** Starts the worker's behavior and returns the function that stops it. */
export function start(orca: OrcaWorkerApi, sources: Record<string, UsageSource>): () => void {
  async function refresh(): Promise<UsageReport> {
    const report = buildReport(await readAllUsage(sources), DEFAULT_ALERT_RULES, Date.now())
    orca.panels.post('usage.changed', report)
    await orca.host.call('statusBar.update', { id: STATUS_BAR_ITEM, visible: true, ...statusBarView(report) })
    return report
  }
  const refreshInBackground = (): void => {
    refresh().catch((error: unknown) => orca.log(`Usage refresh failed: ${String(error)}`))
  }

  orca.panels.handle('usage.read', refresh)
  const timer = setInterval(refreshInBackground, POLL_MS)
  refreshInBackground()
  return () => clearInterval(timer)
}
