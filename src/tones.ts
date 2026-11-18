// How an alert level and a window read in Orca, shared by the panel and the status bar.
import type { AlertLevel, RuleKind, RuleLevel } from './core/alerts'
import type { WindowKind } from './core/usage'

export const LEVEL_TONE = { ok: 'success', warning: 'warning', urgent: 'danger' } as const satisfies Record<
  AlertLevel,
  string
>

export const LEVEL_LABEL: Record<AlertLevel, string> = { ok: 'On track', warning: 'Spend soon', urgent: 'Spend now' }

export const WINDOW_LABEL: Record<WindowKind, string> = { session: 'Session', weekly: 'Weekly', monthly: 'Monthly' }

/** How a rule's level is named where rules are edited and where they are drawn. */
export const RULE_LEVEL_LABEL: Record<RuleLevel, string> = { mark: 'No colour', warning: 'Yellow', urgent: 'Red' }

export const RULE_KIND_LABEL: Record<RuleKind, string> = { plan: 'Plan reset', reset: 'Rate limit reset' }
