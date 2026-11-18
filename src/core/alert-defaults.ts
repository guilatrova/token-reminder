import type { AlertRules } from './alerts'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export const DEFAULT_ALERT_RULES: AlertRules = {
  general: {
    plan: [
      { withinMs: 4 * DAY, minLeftPercent: 80, level: 'mark' },
      { withinMs: 3 * DAY, minLeftPercent: 50, level: 'warning' },
      { withinMs: 3 * DAY, minLeftPercent: 70, level: 'urgent' },
      { withinMs: 6 * HOUR, minLeftPercent: 90, level: 'critical' },
    ],
    // A reset is worth a whole plan window, so it is worth spending however much of the plan is left.
    reset: [
      { withinMs: 15 * DAY, minLeftPercent: 0, level: 'warning' },
      { withinMs: 7 * DAY, minLeftPercent: 0, level: 'urgent' },
      { withinMs: 3 * DAY, minLeftPercent: 0, level: 'critical' },
    ],
  },
  accounts: {},
}
