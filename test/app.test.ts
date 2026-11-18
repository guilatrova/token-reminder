import { assert, mountWorker, test } from 'orca/testing'
import type { OrcaWorkerApi } from 'orca/worker'
import { memoryUsage } from '../src/adapters/memory'
import { start } from '../src/app'
import type { AccountReading, UsageSource } from '../src/core/usage'

const HOUR = 60 * 60 * 1000

function workerWith(sources: Record<string, UsageSource>) {
  let stop = () => {}
  return {
    default: (orca: OrcaWorkerApi) => void (stop = start(orca, sources)),
    deactivate: () => stop(),
  }
}

const reading = (leftPercent: number, hoursToReset: number): AccountReading => ({
  status: 'ok',
  account: null,
  plan: 'pro',
  windows: [{ kind: 'weekly', usedPercent: 100 - leftPercent, resetsAt: Date.now() + hoursToReset * HOUR }],
  resetCredits: null,
})

test('answers the panel, posts the report and shows the worst alert in the status bar', async () => {
  const worker = await mountWorker(workerWith({ Alpha: memoryUsage([reading(80, 12)]) }))
  const report = await worker.request('usage.read')
  assert.equal(report.accounts[0]?.status === 'ok' && report.accounts[0].level, 'urgent')
  assert.deepEqual(worker.posts.at(-1), { event: 'usage.changed', payload: report })
  assert.deepEqual(worker.host.callsOf('statusBar.update').at(-1), {
    id: 'worst-alert',
    visible: true,
    text: 'Alpha 80% left',
    tone: 'danger',
    tooltip: 'Spend now: resets in 12h',
  })
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('hides the status bar item when nothing alerts, and one failing provider does not hide another', async () => {
  const broken: UsageSource = { read: () => Promise.reject(new Error('disk on fire')) }
  const worker = await mountWorker(workerWith({ Alpha: memoryUsage([reading(90, 150)]), Beta: broken }))
  const report = await worker.request('usage.read')
  assert.deepEqual(
    report.accounts.map((account) => [account.provider, account.status]),
    [
      ['Alpha', 'ok'],
      ['Beta', 'unavailable'],
    ],
  )
  assert.deepEqual(worker.host.callsOf('statusBar.update').at(-1), { id: 'worst-alert', visible: false })
  await worker.deactivate()
})
