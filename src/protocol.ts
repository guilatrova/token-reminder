// The panel <-> worker contract, declared once: src/panel/main.ts and src/app.ts both read it.
import type { AlertRule } from './core/alerts'
import type { UsageReport } from './core/report'
import type { Preferences } from './preferences'

declare module 'orca' {
  interface PluginRequests {
    /**
     * The report from the last read, answered at once. It waits for a read only when there is none
     * recent enough to trust; when the last one is getting old it starts a read that posts `usage.changed`.
     */
    'usage.latest': { output: UsageReport }
    /** Reads every provider now and answers the fresh report. */
    'usage.read': { output: UsageReport }
    /** Replaces the alert rules and answers the last read judged by them. It does not read the providers. */
    'rules.save': { input: { rules: AlertRule[] }; output: UsageReport }
    'preferences.read': { output: Preferences }
    /** Replaces the preferences and answers them as stored. */
    'preferences.save': { input: Preferences; output: Preferences }
  }
  interface PluginPanelEvents {
    /** Posted to every open panel after each read, the periodic ones included, and after the rules change. */
    'usage.changed': UsageReport
  }
}
