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

const reading = (leftPercent: number, hoursToReset: number, resets = 0): AccountReading => ({
  status: 'ok',
  account: 'person@example.com',
  plan: 'pro',
  windows: [{ kind: 'weekly', usedPercent: 100 - leftPercent, resetsAt: Date.now() + hoursToReset * HOUR }],
  resetCredits: { available: resets, nextExpiresAt: resets ? Date.now() + 300 * HOUR : null },
})

test('shows the most pressing window, and pressing the item answers every account', async () => {
  const worker = await mountWorker(
    workerWith({ Alpha: memoryUsage([reading(90, 150, 2)]), Beta: memoryUsage([reading(80, 12)]) }),
  )
  const details = await worker.command('token-reminder.refresh')
  assert.deepEqual(worker.host.callsOf('statusBar.update').at(-1), {
    id: 'unused-plan',
    visible: true,
    text: 'Beta 80% left · 12h',
    tone: 'danger',
    tooltip: details,
  })
  assert.equal(
    details,
    [
      'Beta person@example.com (pro)',
      '  Weekly: 80% left, resets in 12h (Spend now)',
      'Alpha person@example.com (pro)',
      '  Weekly: 90% left, resets in 6d 6h (On track)',
      '  Resets available: 2, next expires in 12d 12h',
    ].join('\n'),
  )
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('stays neutral when on track, and one failing provider does not hide another', async () => {
  const broken: UsageSource = { read: () => Promise.reject(new Error('disk on fire')) }
  const worker = await mountWorker(workerWith({ Alpha: memoryUsage([reading(90, 150)]), Beta: broken }))
  const details = await worker.command('token-reminder.refresh')
  const shown = worker.host.callsOf('statusBar.update').at(-1)
  assert.deepEqual(shown, {
    id: 'unused-plan',
    visible: true,
    text: 'Alpha 90% left · 6d 6h',
    tone: 'neutral',
    tooltip: details,
  })
  assert.match(String(details), /Beta: unavailable\. disk on fire/)
  await worker.deactivate()
})

test('says so when Orca manages no account', async () => {
  const worker = await mountWorker(workerWith({ Alpha: memoryUsage([]) }))
  await worker.command('token-reminder.refresh')
  const shown = worker.host.callsOf('statusBar.update').at(-1)
  assert.deepEqual(shown, {
    id: 'unused-plan',
    visible: true,
    text: 'No accounts',
    tone: 'neutral',
    tooltip: 'No account managed by Orca was found.',
  })
  await worker.deactivate()
})
