// The panel only draws the report the worker builds; every rule lives in src/core.
import {
  atom,
  Box,
  EmptyState,
  env,
  Heading,
  IconButton,
  plugin,
  read,
  Row,
  Separator,
  set,
  Stack,
  Text,
  type PanelContext,
} from 'orca'
import { formatDuration, type AlertLevel, type AlertRule } from './core/alerts'
import type { AccountReport, UsageReport } from './core/report'
import { leftPercent } from './core/usage'
import { RulesEditor } from './rules-editor'
import { LEVEL_TONE, WINDOW_LABEL } from './tones'
import './protocol'

const report = atom<UsageReport | null>(null)
const loading = atom(false)
/** Why the last read failed as a whole; null when it worked. */
const failure = atom<string | null>(null)
/** Whether the alert rules are showing instead of the accounts. */
const editingRules = atom(false)

/** Runs a worker request that answers a report, tracking its progress and failure. */
async function load(request: () => Promise<UsageReport>): Promise<void> {
  set(loading, true)
  try {
    set(report, await request())
    set(failure, null)
  } catch (error) {
    set(failure, error instanceof Error ? error.message : String(error))
  } finally {
    set(loading, false)
  }
}

const refresh = (): Promise<void> => load(() => plugin.request('usage.read'))
const saveRules = (rules: AlertRule[]): Promise<void> => load(() => plugin.request('rules.save', { rules }))

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(plugin.on('usage.changed', (next) => set(report, next)))
  void refresh()
}

/** One thing that runs out: a plan window or a reset that can still be redeemed. */
type Deadline = { key: string; label: string; endsAt: number | null; value: string; level: AlertLevel }

function deadlines(account: Extract<AccountReport, { status: 'ok' }>): Deadline[] {
  const windows = account.windows.map((window) => ({
    key: window.kind,
    label: WINDOW_LABEL[window.kind],
    endsAt: window.resetsAt,
    value: `${Math.round(leftPercent(window))}%`,
    level: window.alert?.level ?? 'ok',
  }))
  const credits = account.resetCredits
  const resets = Array.from({ length: credits?.available ?? 0 }, (_, index) => ({
    key: `reset-${index}`,
    label: 'Reset',
    endsAt: credits?.expiresAt[index] ?? null,
    value: '',
    level: 'ok' as const,
  }))
  return [...windows, ...resets]
}

function formatDay(at: number): string {
  return new Date(at).toLocaleDateString(env.locale, { month: 'short', day: 'numeric' })
}

function DeadlineRow({ deadline, now }: { deadline: Deadline; now: number }) {
  const { endsAt, level } = deadline
  return (
    <Row justify="between" gap="sm">
      <Text size="sm">
        {deadline.label}
        {endsAt === null ? null : <Text muted>{` · ${formatDay(endsAt)}`}</Text>}
      </Text>
      <Row gap="sm">
        <Text size="sm" muted>
          {endsAt === null ? 'unknown' : formatDuration(endsAt - now)}
        </Text>
        <Box width={40} align="end">
          <Text size="sm" weight="semibold" tone={level === 'ok' ? undefined : LEVEL_TONE[level]}>
            {deadline.value}
          </Text>
        </Box>
      </Row>
    </Row>
  )
}

function Account({ account, now }: { account: AccountReport; now: number }) {
  return (
    <Stack gap="xs">
      <Text weight="semibold">
        {account.provider}
        {account.status === 'ok' && account.plan ? <Text muted weight="regular">{` ${account.plan}`}</Text> : null}
      </Text>
      {account.status === 'unavailable' ? (
        <Text size="sm" tone="warning">
          {account.detail}
        </Text>
      ) : (
        deadlines(account).map((deadline) => <DeadlineRow key={deadline.key} deadline={deadline} now={now} />)
      )}
    </Stack>
  )
}

function Accounts({ current }: { current: UsageReport }) {
  return (
    <Stack gap="md">
      {current.accounts.length === 0 ? (
        <EmptyState icon="agent" title="No accounts" description="Add an account in Orca to see it here." />
      ) : null}
      {current.accounts.flatMap((account, index) => [
        <Separator key={`separator-${index}`} />,
        <Account key={`${account.provider}:${account.account ?? index}`} account={account} now={current.readAt} />,
      ])}
    </Stack>
  )
}

export default function Panel() {
  const current = read(report)
  const error = read(failure)
  return (
    <Stack gap="md">
      <Row justify="between">
        <Heading>
          Unused <Text muted>· left</Text>
        </Heading>
        <Row gap="xs">
          <IconButton
            icon="settings"
            label="Alert rules"
            variant={read(editingRules) ? 'solid' : 'ghost'}
            onPress={() => set(editingRules, !read(editingRules))}
          />
          <IconButton icon="refresh" label="Refresh" variant="ghost" disabled={read(loading)} onPress={refresh} />
        </Row>
      </Row>
      {error ? (
        <Text size="sm" tone="danger">
          {error}
        </Text>
      ) : null}
      {current && read(editingRules) ? <RulesEditor rules={current.rules} onChange={saveRules} /> : null}
      {current && !read(editingRules) ? <Accounts current={current} /> : null}
    </Stack>
  )
}
