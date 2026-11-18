// What the person chose about the plugin itself, as opposed to the alert rules.

export type Preferences = {
  /** Whether the item shows in Orca's status bar. The panel works either way. */
  showStatusBar: boolean
}

export const DEFAULT_PREFERENCES: Preferences = { showStatusBar: true }

/** Preferences as they come from storage or a request; null when the value is not valid. */
export function parsePreferences(value: unknown): Preferences | null {
  if (typeof value !== 'object' || value === null) return null
  const { showStatusBar } = value as Record<string, unknown>
  return typeof showStatusBar === 'boolean' ? { showStatusBar } : null
}
