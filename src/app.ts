// What the worker does, given its usage sources: keep the status bar item on the most pressing
// window, re-reading on a timer and when the item is pressed. It never names a provider.
import type { OrcaWorkerApi } from 'orca/worker'
import { DEFAULT_ALERT_RULES } from './core/alerts'
import { buildReport } from './core/report'
import { readAllUsage, type UsageSource } from './core/usage'
import { statusBarView } from './status-bar'

const STATUS_BAR_ITEM = 'unused-plan'
const REFRESH_COMMAND = 'token-reminder.refresh'
const POLL_MS = 10 * 60 * 1000

/** Starts the worker's behavior and returns the function that stops it. */
export function start(orca: OrcaWorkerApi, sources: Record<string, UsageSource>): () => void {
  /** Reads every source, updates the item and answers its tooltip text. */
  async function refresh(): Promise<string> {
    const view = statusBarView(buildReport(await readAllUsage(sources), DEFAULT_ALERT_RULES, Date.now()))
    await orca.host.call('statusBar.update', { id: STATUS_BAR_ITEM, visible: true, ...view })
    return view.tooltip
  }
  const refreshInBackground = (): void => {
    refresh().catch((error: unknown) => orca.log(`Usage refresh failed: ${String(error)}`))
  }

  // Pressing the item runs this; Orca shows the returned text.
  const command = orca.commands.register(REFRESH_COMMAND, refresh)
  const timer = setInterval(refreshInBackground, POLL_MS)
  refreshInBackground()
  return () => {
    clearInterval(timer)
    command.dispose()
  }
}
