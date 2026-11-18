// The panel only draws the report the worker builds; every rule lives in src/core.
import {
  atom,
  Badge,
  Callout,
  Card,
  Collapsible,
  EmptyState,
  Heading,
  IconButton,
  plugin,
  Progress,
  read,
  RelativeTime,
  Row,
  set,
  Spinner,
  Stack,
  Text,
  type PanelContext,
} from 'orca'
import { describeRule } from './core/alerts'
import type { AccountReport, UsageReport, WindowReport } from './core/report'
import { leftPercent, type ResetCredits, type WindowKind } from './core/usage'
import { LEVEL_LABEL, LEVEL_TONE } from './tones'
import './protocol'

const report = atom<UsageReport | null>(null)
const loading = atom(false)
/** Why the last read failed as a whole; null when it worked. */
const failure = atom<string | null>(null)

const WINDOW_LABEL: Record<WindowKind, string> = { session: 'Session', weekly: 'Weekly', monthly: 'Monthly' }

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

function WindowRow({ window }: { window: WindowReport }) {
  const left = Math.round(leftPercent(window))
  const label = WINDOW_LABEL[window.kind]
  return (
    <Stack gap="xs">
      <Row justify="between" gap="sm">
        <Text size="sm">
          <Text weight="semibold">{label}</Text>
          {window.resetsAt === null ? (
            <Text muted> · reset time unknown</Text>
          ) : (
            <Text muted>
              {' · resets '}
              <RelativeTime at={window.resetsAt} format="short" />
            </Text>
          )}
        </Text>
        <Text size="sm" weight="semibold">
          {left}% left
        </Text>
      </Row>
      <Progress label={`${label}: ${left}% left`} labelHidden value={left} />
      {window.alert?.rule ? (
        <Text size="xs" tone={LEVEL_TONE[window.alert.level]}>
          {describeRule(window.alert.rule)}
        </Text>
      ) : null}
    </Stack>
  )
}

function ResetCreditsRow({ credits }: { credits: ResetCredits }) {
  return (
    <Text size="sm">
      <Text weight="semibold">
        {credits.available} {credits.available === 1 ? 'reset' : 'resets'} available
      </Text>
      {credits.nextExpiresAt === null ? (
        <Text muted> · expiry unknown</Text>
      ) : (
        <Text muted>
          {' · next expires '}
          <RelativeTime at={credits.nextExpiresAt} format="short" />
        </Text>
      )}
    </Text>
  )
}

function AccountCard({ account }: { account: AccountReport }) {
  const title = account.status === 'ok' && account.plan ? `${account.provider} · ${account.plan}` : account.provider
  return (
    <Card title={title} description={account.account ?? undefined}>
      {account.status === 'unavailable' ? (
        <Callout tone="warning" title="Usage unavailable">
          <Text size="sm">{account.detail}</Text>
        </Callout>
      ) : (
        <Stack gap="md">
          <Row>
            <Badge tone={LEVEL_TONE[account.level]}>{LEVEL_LABEL[account.level]}</Badge>
          </Row>
          {account.windows.length === 0 ? <Text muted>This plan reports no usage window.</Text> : null}
          {account.windows.map((window) => (
            <WindowRow key={window.kind} window={window} />
          ))}
          {account.resetCredits && account.resetCredits.available > 0 ? (
            <ResetCreditsRow credits={account.resetCredits} />
          ) : null}
        </Stack>
      )}
    </Card>
  )
}

function Accounts({ current }: { current: UsageReport }) {
  if (current.accounts.length === 0) {
    return (
      <EmptyState
        icon="agent"
        title="No logins found"
        description="Sign in to Codex on this machine to see its usage."
      />
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
