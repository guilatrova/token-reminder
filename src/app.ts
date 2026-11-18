// What the worker does, given its usage sources: answer the panel, re-read on a timer and keep
// the status bar item on the most pressing alert. It never names a provider.
import type { OrcaWorkerApi } from 'orca/worker'
import { DEFAULT_ALERT_RULES, formatDuration } from './core/alerts'
import { buildReport, headline, type UsageReport } from './core/report'
import { readAllUsage, type UsageSource } from './core/usage'
import { LEVEL_LABEL, LEVEL_TONE } from './tones'
import './protocol'

const STATUS_BAR_ITEM = 'worst-alert'
const POLL_MS = 10 * 60 * 1000

async function showHeadline(orca: OrcaWorkerApi, report: UsageReport): Promise<void> {
  const top = headline(report)
  if (!top) {
    await orca.host.call('statusBar.update', { id: STATUS_BAR_ITEM, visible: false })
    return
  }
  await orca.host.call('statusBar.update', {
    id: STATUS_BAR_ITEM,
    visible: true,
    text: `${top.provider} ${Math.round(top.leftPercent)}% left`,
    tone: LEVEL_TONE[top.level],
    tooltip: `${LEVEL_LABEL[top.level]}: resets in ${formatDuration(top.resetsAt - report.readAt)}`,
  })
}

/** Starts the worker's behavior and returns the function that stops it. */
export function start(orca: OrcaWorkerApi, sources: Record<string, UsageSource>): () => void {
  async function refresh(): Promise<UsageReport> {
    const report = buildReport(await readAllUsage(sources), DEFAULT_ALERT_RULES, Date.now())
    orca.panels.post('usage.changed', report)
    await showHeadline(orca, report)
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
