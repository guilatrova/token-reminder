// What the worker does, given its usage sources: keep the last read, answer the panel from it,
// re-read on a timer and show the status bar item while something needs spending. It never names a provider.
import type { OrcaWorkerApi } from 'orca/worker'
import { DEFAULT_ALERT_RULES, parseAlertRules, type AlertRules } from './core/alerts'
import { buildReport, recordCompletion, type TiboMission, restoreMission, type UsageReport } from './core/report'
import { readAllUsage, type AccountUsage, type UsageSource } from './core/usage'
import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from './preferences'
import { statusBarView } from './status-bar'
import './protocol'

const STATUS_BAR_ITEM = 'unused-plan'
const RULES_KEY = 'alertRules'
const PREFERENCES_KEY = 'preferences'
// The logins are the ones Orca's own usage meter uses, so the providers are asked as seldom as possible.
const POLL_MS = 10 * 60 * 1000
/** A panel that opens on a read older than this starts a new one, and shows the old one meanwhile. */
const STALE_MS = 2 * 60 * 1000
/** Past this (the timer was off, or the machine slept) the last read says too little: the panel waits for a new one. */
const EXPIRED_MS = 2 * POLL_MS

/** Starts the worker's behavior and resolves to the function that stops it. */
export async function start(
  orca: OrcaWorkerApi,
  sources: Record<string, UsageSource>,
  now: () => number = Date.now,
  missionTokens?: (start: number, end: number) => Promise<number | null>,
): Promise<() => void> {
  let lastRead: { accounts: AccountUsage[]; at: number } | null = null
  let reading: Promise<UsageReport> | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  const savedMission = await orca.storage.get('tiboReset')
  let mission = restoreMission(savedMission, now())
  if (savedMission === true && mission) await orca.storage.set('tiboReset', mission)

  // Mode changes and completed reads share a single ordered storage record.
  let missionWrite = Promise.resolve()
  function withMission<T>(action: () => Promise<T>): Promise<T> {
    const result = missionWrite.then(action)
    missionWrite = result.then(
      () => {},
      () => {},
    )
    return result
  }
  const stored = await orca.storage.get(PREFERENCES_KEY)
  const parsed = stored === null || stored === undefined ? DEFAULT_PREFERENCES : parsePreferences(stored)
  if (!parsed) throw new Error('The saved preferences are not valid.')
  let preferences: Preferences = parsed

  /** The person's rules; the built-in ones until they save their own. */
  async function storedRules(): Promise<AlertRules> {
    const stored = await orca.storage.get(RULES_KEY)
    if (stored === null || stored === undefined) return DEFAULT_ALERT_RULES
    const rules = parseAlertRules(stored)
    if (!rules) throw new Error('The saved alert rules are not valid. Save them again from the panel.')
    return rules
  }

  /** The last read as it stands right now: today's rules, and every time left counted from this moment. */
  async function judged(accounts: AccountUsage[], observedMission?: TiboMission | null): Promise<UsageReport> {
    const rules = await storedRules()
    return withMission(async () => {
      const report = buildReport(accounts, rules, now(), mission)
      if (mission && observedMission === mission) recordCompletion(report)
      if (report.tiboReset && report.tiboReset !== mission) {
        const completed = report.tiboReset
        if (missionTokens && completed.stats && completed.finishedAt !== null) {
          completed.stats.localTokens = await missionTokens(completed.startedAt, completed.finishedAt).catch(() => null)
        }
        await orca.storage.set('tiboReset', completed)
        mission = report.tiboReset
        applyStatusBarPreference()
      }
      return report
    })
  }

  async function publish(report: UsageReport): Promise<UsageReport> {
    orca.panels.post('usage.changed', report)
    // Decided here, not when the read started: the person may have hidden the item while it ran.
    const view = preferences.showStatusBar ? statusBarView(report) : null
    const item = view ? { visible: true, ...view } : { visible: false }
    await orca.host.call('statusBar.update', { id: STATUS_BAR_ITEM, ...item })
    return report
  }

  /** Reads every provider and publishes the result. Callers that overlap share one read. */
  function read(): Promise<UsageReport> {
    reading ??= (async () => {
      try {
        const observedMission = mission
        lastRead = { accounts: await readAllUsage(sources), at: now() }
        return await publish(await judged(lastRead.accounts, observedMission))
      } finally {
        reading = null
      }
    })()
    return reading
  }
  const readInBackground = (): void => {
    read().catch((error: unknown) => orca.log(`Usage refresh failed: ${String(error)}`))
  }

  /** Poll during a mission even when the status bar is hidden, so completion is recorded with the panel closed. */
  function applyStatusBarPreference(): void {
    if (timer) clearInterval(timer)
    // Unreferenced: the timer alone must not keep a process alive (a test that fails before stopping it).
    timer =
      preferences.showStatusBar || mission?.finishedAt === null ? setInterval(readInBackground, POLL_MS).unref() : null
  }

  orca.panels.handle('usage.read', read)
  orca.panels.handle('usage.latest', async () => {
    if (!lastRead || now() - lastRead.at > EXPIRED_MS) return read()
    if (now() - lastRead.at > STALE_MS) readInBackground()
    return judged(lastRead.accounts)
  })
  orca.panels.handle('rules.save', async (input) => {
    const rules = parseAlertRules(input.rules)
    if (!rules) throw new Error('Those alert rules are not valid.')
    await orca.storage.set(RULES_KEY, rules)
    // A read that is already running answers with the new rules or is followed by this one; either way no new read.
    await reading?.catch(() => undefined)
    return lastRead ? publish(await judged(lastRead.accounts)) : read()
  })
  orca.panels.handle('tibo.set', async ({ active }) => {
    if (typeof active !== 'boolean') throw new Error('Invalid Tibo Reset mode.')
    const started = await withMission(async () => {
      if (active === !!mission) return false
      const next = active ? { startedAt: now(), finishedAt: null } : null
      await orca.storage.set('tiboReset', next ?? false)
      mission = next
      applyStatusBarPreference()
      return active
    })
    await reading?.catch(() => undefined)
    return started || !lastRead ? read() : publish(await judged(lastRead.accounts))
  })
  orca.panels.handle('preferences.read', async () => preferences)
  orca.panels.handle('preferences.save', async (input) => {
    const saved = parsePreferences(input)
    if (!saved) throw new Error('Those preferences are not valid.')
    await orca.storage.set(PREFERENCES_KEY, saved)
    preferences = saved
    applyStatusBarPreference()
    if (!saved.showStatusBar) await orca.host.call('statusBar.update', { id: STATUS_BAR_ITEM, visible: false })
    else {
      const age = lastRead ? now() - lastRead.at : Infinity
      if (lastRead && age <= EXPIRED_MS) await publish(await judged(lastRead.accounts))
      if (age > STALE_MS) readInBackground()
    }
    return saved
  })

  applyStatusBarPreference()
  // The item does not stay hidden across an Orca restart by itself.
  if (preferences.showStatusBar || mission?.finishedAt === null) readInBackground()
  else await orca.host.call('statusBar.update', { id: STATUS_BAR_ITEM, visible: false })
  return () => {
    if (timer) clearInterval(timer)
  }
}
