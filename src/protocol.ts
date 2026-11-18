// The panel <-> worker contract, declared once: src/panel.tsx and src/app.ts both read it.
import type { AlertRule } from './core/alerts'
import type { UsageReport } from './core/report'

declare module 'orca' {
  interface PluginRequests {
    /** Reads every provider now and answers the fresh report. */
    'usage.read': { output: UsageReport }
    /** Replaces the alert rules and answers the report judged by them. */
    'rules.save': { input: { rules: AlertRule[] }; output: UsageReport }
  }
  interface PluginPanelEvents {
    /** Posted to every open panel after each read, the periodic ones included. */
    'usage.changed': UsageReport
  }
}
