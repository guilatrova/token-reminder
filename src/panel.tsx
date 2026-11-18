// The panel only draws the report the worker builds; every rule lives in src/core.
import {
  atom,
  Badge,
  Callout,
  Card,
  Collapsible,
  EmptyState,
  env,
  Heading,
  IconButton,
  plugin,
  read,
  RelativeTime,
  Row,
  set,
  Spinner,
  Stack,
  Table,
  Text,
  type PanelContext,
  type TableColumn,
  type TableRow,
} from 'orca'
import { describeRule } from './core/alerts'
import type { AccountReport, UsageReport } from './core/report'
import { leftPercent } from './core/usage'
import { LEVEL_LABEL, LEVEL_TONE, WINDOW_LABEL } from './tones'
import './protocol'

const report = atom<UsageReport | null>(null)
const loading = atom(false)
/** Why the last read failed as a whole; null when it worked. */
const failure = atom<string | null>(null)

async function refresh(): Promise<void> {
  set(loading, true)
  try {
    set(report, await plugin.request('usage.read'))
    set(failure, null)
  } catch (error) {
    set(failure, error instanceof Error ? error.message : String(error))
  } finally {
    set(loading, false)
  }
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(plugin.on('usage.changed', (next) => set(report, next)))
  void refresh()
}

function formatDate(at: number): string {
  return new Date(at).toLocaleString(env.locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** One line per thing that runs out: each plan window, then each reset that can still be redeemed. */
function deadlineRows(account: Extract<AccountReport, { status: 'ok' }>): TableRow[] {
  const cells = (what: string, left: string, at: number | null) => ({
    what,
    left,
    when: at === null ? 'Unknown' : formatDate(at),
    remaining: at === null ? null : ({ type: 'relative', at, format: 'duration' } as const),
  })
  const windows = account.windows.map((window) => ({
    key: window.kind,
    cells: cells(`${WINDOW_LABEL[window.kind]} limit`, `${Math.round(leftPercent(window))}%`, window.resetsAt),
  }))
  const credits = account.resetCredits
  const resets = Array.from({ length: credits?.available ?? 0 }, (_, index) => ({
    key: `reset-${index}`,
    cells: cells(`Reset ${index + 1}`, 'Unused', credits?.expiresAt[index] ?? null),
  }))
  return [...windows, ...resets]
}

const DEADLINE_COLUMNS: TableColumn[] = [
  { key: 'what', label: 'What', minWidth: 'sm' },
  { key: 'left', label: 'Left', align: 'end' },
  { key: 'when', label: 'Ends', hideBelow: 'sm' },
  { key: 'remaining', label: 'Time left', align: 'end' },
]

function AccountCard({ account }: { account: AccountReport }) {
  const title = account.status === 'ok' && account.plan ? `${account.provider} · ${account.plan}` : account.provider
  if (account.status === 'unavailable') {
    return (
      <Card title={title} description={account.account ?? undefined}>
        <Callout tone="warning" title="Usage unavailable">
          <Text size="sm">{account.detail}</Text>
        </Callout>
      </Card>
    )
  }
  const alerting = account.windows.filter((window) => window.alert?.rule)
  return (
    <Card title={title} description={account.account ?? undefined}>
      <Stack gap="sm">
        <Row>
          <Badge tone={LEVEL_TONE[account.level]}>{LEVEL_LABEL[account.level]}</Badge>
        </Row>
        {alerting.map((window) => (
          <Text key={window.kind} size="xs" tone={LEVEL_TONE[window.alert?.level ?? 'ok']}>
            {`${WINDOW_LABEL[window.kind]}: ${window.alert?.rule ? describeRule(window.alert.rule) : ''}`}
          </Text>
        ))}
        <Table
          label={`${title} deadlines`}
          columns={DEADLINE_COLUMNS}
          rows={deadlineRows(account)}
          emptyText="This plan reports no usage window."
          maxHeight="none"
        />
      </Stack>
    </Card>
  )
}

function Accounts({ current }: { current: UsageReport }) {
  if (current.accounts.length === 0) {
    return (
      <EmptyState icon="agent" title="No logins found" description="Add an account in Orca to see its usage here." />
    )
  }
  return (
    <Stack gap="md">
      {current.accounts.map((account, index) => (
        <AccountCard key={`${account.provider}:${account.account ?? index}`} account={account} />
      ))}
      <Collapsible title="Alert rules" description="Weekly and monthly windows; the worst match wins.">
        <Stack gap="xs">
          {current.rules.map((rule) => (
            <Row key={describeRule(rule)} gap="sm">
              <Badge tone={LEVEL_TONE[rule.level]}>{LEVEL_LABEL[rule.level]}</Badge>
              <Text size="sm">{describeRule(rule)}</Text>
            </Row>
          ))}
        </Stack>
      </Collapsible>
    </Stack>
  )
}

export default function Panel() {
  const current = read(report)
  const error = read(failure)
  return (
    <Stack gap="md">
      <Row justify="between">
        <Heading>Unused plan</Heading>
        <Row gap="xs">
          {read(loading) ? <Spinner label="Reading usage" labelHidden /> : null}
          <IconButton icon="refresh" label="Refresh" variant="ghost" disabled={read(loading)} onPress={refresh} />
        </Row>
      </Row>
      {error ? (
        <Callout tone="danger" title="Could not read usage">
          <Text size="sm">{error}</Text>
        </Callout>
      ) : null}
      {current ? <Accounts current={current} /> : null}
      {current ? (
        <Text muted size="xs">
          {'Updated '}
          <RelativeTime at={current.readAt} format="short" />
        </Text>
      ) : null}
    </Stack>
  )
}
