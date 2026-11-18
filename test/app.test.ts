import { assert, mountWorker, test } from 'orca/testing'
import type { OrcaWorkerApi } from 'orca/worker'
import { memoryUsage } from '../src/adapters/memory'
import { start } from '../src/app'
import type { AccountReading, UsageSource } from '../src/core/usage'

const HOUR = 60 * 60 * 1000

function workerWith(sources: Record<string, UsageSource>, now?: () => number) {
  let stop = () => {}
  return {
    default: async (orca: OrcaWorkerApi) => void (stop = await start(orca, sources, now)),
    deactivate: () => stop(),
  }
}

/** A source that counts how often it is asked: every read is a request to the provider. */
function counted(accounts: AccountReading[]) {
  const source = { reads: 0, read: async () => (source.reads++, accounts) }
  return source
}

/** Lets a read that was started in the background finish. */
const settled = () => new Promise((resolve) => setImmediate(resolve))

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

test('answers the panel from the last read, and changing the rules asks no provider', async () => {
  const alpha = counted([reading(30, 100)])
  const worker = await mountWorker(workerWith({ Alpha: alpha }))
  await worker.request('usage.latest')
  await worker.request('usage.latest')
  assert.equal(alpha.reads, 1)
  const rules = [{ withinMs: 120 * HOUR, minLeftPercent: 20, level: 'urgent' as const }]
  const report = await worker.request('rules.save', { rules })
  assert.equal(report.accounts[0]?.status === 'ok' && report.accounts[0].level, 'urgent')
  assert.equal(alpha.reads, 1)
  await worker.request('usage.read')
  assert.equal(alpha.reads, 2)
  await worker.deactivate()
})

test('a read that is getting old is shown while a new one runs; a very old one is not shown', async () => {
  const alpha = counted([reading(30, 100)])
  let clock = Date.now()
  const worker = await mountWorker(workerWith({ Alpha: alpha }, () => clock))
  await worker.request('usage.latest')
  const postsBefore = worker.posts.length

  clock += 3 * 60 * 1000
  const shownAtOnce = await worker.request('usage.latest')
  assert.equal(shownAtOnce.readAt, clock)
  await settled()
  assert.equal(alpha.reads, 2)
  assert.equal(worker.posts.length, postsBefore + 1)

  clock += 60 * 60 * 1000
  const fresh = await worker.request('usage.latest')
  assert.equal(alpha.reads, 3)
  assert.deepEqual(worker.posts.at(-1), { event: 'usage.changed', payload: fresh })
  await worker.deactivate()
})

test('the status bar item can be hidden, stays hidden across a restart and comes back', async () => {
  const alpha = counted([reading(90, 150)])
  const worker = await mountWorker(workerWith({ Alpha: alpha }))
  await worker.request('usage.read')
  assert.deepEqual(await worker.request('preferences.read'), { showStatusBar: true })
  await worker.request('preferences.save', { showStatusBar: false })
  assert.deepEqual(lastStatusBar(worker), { id: 'unused-plan', visible: false })
  await worker.request('usage.read')
  assert.deepEqual(lastStatusBar(worker), { id: 'unused-plan', visible: false })
  await assert.rejects(worker.request('preferences.save', { showStatusBar: 'no' } as never))
  await worker.deactivate()

  const readsBefore = alpha.reads
  const restarted = await mountWorker(workerWith({ Alpha: alpha }), { host: worker.host })
  await settled()
  assert.deepEqual(await restarted.request('preferences.read'), { showStatusBar: false })
  assert.deepEqual(lastStatusBar(restarted), { id: 'unused-plan', visible: false })
  assert.equal(alpha.reads, readsBefore)

  await restarted.request('preferences.save', { showStatusBar: true })
  await settled()
  const shown = lastStatusBar(restarted) as { visible: boolean; text: string }
  assert.deepEqual([shown.visible, shown.text], [true, 'Alpha 90% left · 6d 6h'])
  await restarted.deactivate()
})
