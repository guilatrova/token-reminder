// Presentation only: dates, durations and counts as text. Nothing here judges usage.
import { formatDuration } from '../core/alerts'

export type ViewContext = {
  locale: string
  /** The report's `readAt`: every "time left" counts from here, like the report does. */
  readAt: number
  /** Whether bars grow in. Only the first time a report is drawn. */
  animate: boolean
  opened: Map<string, boolean>
  onToggle: (key: string, open: boolean) => void
  /** Opens a page in the browser; null where Orca cannot open links (browser clients). */
  openExternal: ((url: string) => void) | null
}

export const percent = (value: number) => `${Math.round(value)}%`

export const shortDate = (ms: number, locale: string) =>
  new Date(ms).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })

export const timeLeft = (deadline: number, readAt: number) => formatDuration(deadline - readAt)
