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
  windows: [
    {
      kind: 'weekly',
      lengthMs: 168 * HOUR,
      usedPercent: 100 - leftPercent,
      resetsAt: Date.now() + hoursToReset * HOUR,
    },
  ],
  resetCredits: { available: resets, expiresAt: resets ? [Date.now() + 300 * HOUR] : [] },
})

async function request(worker: Awaited<ReturnType<typeof mountWorker>>, name: 'usage.read') {
  await worker.request(name)
  return worker
}

const lastStatusBar = (worker: Awaited<ReturnType<typeof mountWorker>>) =>
  worker.host.callsOf('statusBar.update').at(-1)

test('answers the panel, posts the report and puts the most pressing window in the status bar', async () => {
  const worker = await mountWorker(
    workerWith({ Alpha: memoryUsage([reading(90, 150, 2)]), Beta: memoryUsage([reading(80, 12)]) }),
  )
  const report = await worker.request('usage.read')
  assert.deepEqual(worker.posts.at(-1), { event: 'usage.changed', payload: report })
  const shown = lastStatusBar(worker) as { text: string; tone: string; tooltip: string }
  assert.deepEqual([shown.text, shown.tone], ['Beta 80% left · 12h', 'danger'])
  assert.match(
    shown.tooltip,
    /^Beta pro: Weekly 80% left, 12h \(\w+ \d+\), Spend now \| Alpha pro: Weekly 90% left, 6d 6h \(\w+ \d+\) · Reset 12d 12h \(\w+ \d+\) · Reset unknown$/,
  )
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('stays neutral when on track, and one failing provider does not hide another', async () => {
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
  const shown = lastStatusBar(worker) as { text: string; tone: string; tooltip: string }
  assert.deepEqual([shown.text, shown.tone], ['Alpha 90% left · 6d 6h', 'neutral'])
  assert.match(shown.tooltip, /Beta: unavailable\. disk on fire/)
  await worker.deactivate()
})

test('says so when Orca manages no account', async () => {
  const worker = await mountWorker(workerWith({ Alpha: memoryUsage([]) }))
  await worker.request('usage.read')
  assert.deepEqual(lastStatusBar(worker), {
    id: 'unused-plan',
    visible: true,
    text: 'No accounts',
    tone: 'neutral',
    tooltip: 'No account managed by Orca was found.',
  })
  await worker.deactivate()
})

test('saved rules replace the built-in ones and survive a restart', async () => {
  const sources = { Alpha: memoryUsage([reading(30, 100)]) }
  const worker = await mountWorker(workerWith(sources))
  assert.equal((lastStatusBar(await request(worker, 'usage.read')) as { tone: string }).tone, 'neutral')
  const rules = [{ withinMs: 120 * HOUR, minLeftPercent: 20, level: 'urgent' as const }]
  const report = await worker.request('rules.save', { rules })
  assert.deepEqual(report.rules, rules)
  assert.equal((lastStatusBar(worker) as { tone: string }).tone, 'danger')
  await assert.rejects(worker.request('rules.save', { rules: [{ ...rules[0]!, minLeftPercent: 140 }] }))
  await worker.deactivate()

  const restarted = await mountWorker(workerWith(sources), { host: worker.host })
  assert.deepEqual((await restarted.request('usage.read')).rules, rules)
  await restarted.deactivate()
})
