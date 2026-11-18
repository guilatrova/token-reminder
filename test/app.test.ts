import { assert, mountWorker, test } from 'orca/testing'
import type { OrcaWorkerApi } from 'orca/worker'
import { memoryUsage } from '../src/adapters/memory'
import { start } from '../src/app'
import { DEFAULT_ALERT_RULES, withRuleList } from '../src/core/alerts'
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

test('answers the panel, posts the report and puts what needs spending in the status bar', async () => {
  const worker = await mountWorker(
    workerWith({
      Alpha: memoryUsage([reading(90, 150)]),
      Beta: memoryUsage([reading(80, 12)]),
      Gamma: memoryUsage([reading(60, 40)]),
    }),
  )
  const report = await worker.request('usage.read')
  // Orca refuses an answer that is not plain JSON, such as one with an undefined field.
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report)
  assert.deepEqual(worker.posts.at(-1), { event: 'usage.changed', payload: report })
  const shown = lastStatusBar(worker) as { text: string; tone: string; tooltip: string }
  assert.deepEqual([shown.text, shown.tone], ['Beta: spend 80% in 12h · +1', 'danger'])
  assert.match(
    shown.tooltip,
    /^Beta: spend 80% by \w+, \w+ \d+ \(12h\)  ·  Gamma: spend 60% by \w+, \w+ \d+ \(1d 16h\)$/,
  )
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('stays out of the status bar when on track, and one failing provider does not hide another', async () => {
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
  assert.deepEqual(lastStatusBar(worker), { id: 'unused-plan', visible: false })
  await worker.deactivate()
})

test('saved rules replace the built-in ones and survive a restart', async () => {
  const sources = { Alpha: memoryUsage([reading(30, 100)]) }
  const worker = await mountWorker(workerWith(sources))
  assert.deepEqual(lastStatusBar(await request(worker, 'usage.read')), { id: 'unused-plan', visible: false })
  const strict = { withinMs: 120 * HOUR, minLeftPercent: 20, level: 'urgent' as const }
  const rules = withRuleList(DEFAULT_ALERT_RULES, null, 'plan', [strict])
  const report = await worker.request('rules.save', { rules })
  assert.deepEqual(report.rules, rules)
  assert.equal((lastStatusBar(worker) as { tone: string }).tone, 'danger')
  const invalid = withRuleList(rules, null, 'plan', [{ ...strict, minLeftPercent: 140 }])
  await assert.rejects(worker.request('rules.save', { rules: invalid }))
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
  const strict = { withinMs: 120 * HOUR, minLeftPercent: 20, level: 'urgent' as const }
  const rules = withRuleList(DEFAULT_ALERT_RULES, null, 'plan', [strict])
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
  const alpha = counted([reading(80, 12)])
  const worker = await mountWorker(workerWith({ Alpha: alpha }))
  await worker.request('usage.read')
  assert.equal((lastStatusBar(worker) as { visible: boolean }).visible, true)
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
  assert.deepEqual([shown.visible, shown.text], [true, 'Alpha: spend 80% in 12h'])
  await restarted.deactivate()
})

test('a reset about to expire is what the status bar says', async () => {
  const expiring = reading(84, 150)
  if (expiring.status === 'ok') expiring.resetCredits = { available: 1, expiresAt: [Date.now() + 100 * HOUR] }
  const worker = await mountWorker(workerWith({ Alpha: memoryUsage([expiring]) }))
  await worker.request('usage.read')
  const shown = lastStatusBar(worker) as { text: string; tone: string }
  assert.deepEqual([shown.text, shown.tone], ['Alpha: use a reset in 4d 4h', 'danger'])
  await worker.deactivate()
})

test('Tibo keeps its clock and earned reward across restarts until the person leaves', async () => {
  let now = 10000
  let remaining = 0
  const sources = { Codex: { read: async () => [reading(remaining, 48)] } }
  const worker = await mountWorker(workerWith(sources, () => now))
  await worker.request('usage.read')
  remaining = 35
  const active = await worker.request('tibo.set', { active: true })
  assert.deepEqual(active.tiboReset, { startedAt: 10000, finishedAt: null })
  await worker.deactivate()
  now += 12000
  const reopened = await mountWorker(
    workerWith(sources, () => now),
    { host: worker.host },
  )
  assert.deepEqual((await reopened.request('tibo.set', { active: true })).tiboReset, active.tiboReset)
  remaining = 0
  const finished = (await reopened.request('usage.read')).tiboReset
  assert.deepEqual(finished, { startedAt: 10000, finishedAt: 22000, stats: { accounts: 1, localTokens: null } })
  await reopened.deactivate()
  remaining = 100
  now += 5000
  const restarted = await mountWorker(
    workerWith(sources, () => now),
    { host: reopened.host },
  )
  assert.deepEqual((await restarted.request('usage.read')).tiboReset, finished)
  await restarted.request('tibo.set', { active: false })
  assert.deepEqual((await restarted.request('tibo.set', { active: true })).tiboReset, {
    startedAt: now,
    finishedAt: null,
  })
  await restarted.deactivate()
})
