// How an alert level looks in Orca, shared by the panel and the status bar.
import type { AlertLevel } from './core/alerts'

export const LEVEL_TONE = { ok: 'success', warning: 'warning', urgent: 'danger' } as const satisfies Record<
  AlertLevel,
  string
>

export const LEVEL_LABEL: Record<AlertLevel, string> = { ok: 'On track', warning: 'Spend soon', urgent: 'Spend now' }
