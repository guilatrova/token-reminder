// The settings: the alert rules as one sentence per rule, and the plugin's own preferences.
// Every change is handed over at once; nothing here keeps a draft.
import { DEFAULT_ALERT_RULES, formatDuration, type AlertRule } from '../core/alerts'
import type { Preferences } from '../preferences'
import { el, iconButton } from './dom'

const HOUR = 60 * 60 * 1000
const WITHIN_HOURS = [6, 10, 12, 24, 48, 72, 120, 168]
const LEFT_PERCENTS = [10, 20, 30, 40, 50, 60, 70, 80, 90]
const NEW_RULE: AlertRule = { withinMs: 24 * HOUR, minLeftPercent: 50, level: 'warning' }

export type SettingsActions = {
  saveRules: (rules: AlertRule[]) => void
  savePreferences: (preferences: Preferences) => void
  showAccounts: () => void
}

type Option = { value: string; text: string }

/** A select drawn as a word of the sentence: no box until it is pointed at. */
function chip(label: string, options: Option[], current: string, focusKey: string, onChange: (value: string) => void) {
  const select = el('select', 'chip')
  for (const option of options) select.append(new Option(option.text, option.value))
  select.value = current
  select.setAttribute('aria-label', label)
  select.dataset.focus = focusKey
  select.addEventListener('change', () => onChange(select.value))
  return select
}

/** The list plus the rule's own value, so a saved rule that is not in the list still shows. */
function numberOptions(values: number[], current: number, text: (value: number) => string): Option[] {
  return [...new Set([...values, current])]
    .sort((a, b) => a - b)
    .map((value) => ({ value: String(value), text: text(value) }))
}

function ruleRow(rules: AlertRule[], rule: AlertRule, index: number, onSave: (rules: AlertRule[]) => void) {
  const change = (patch: Partial<AlertRule>) =>
    onSave(rules.map((other, i) => (i === index ? { ...other, ...patch } : other)))
  const level = chip(
    'Alert colour',
    [
      { value: 'warning', text: 'Yellow' },
      { value: 'urgent', text: 'Red' },
    ],
    rule.level,
    `rule-${index}-level`,
    (value) => change({ level: value === 'urgent' ? 'urgent' : 'warning' }),
  )
  level.classList.add('level')
  const within = chip(
    'Reset within',
    numberOptions(
      WITHIN_HOURS.map((hours) => hours * HOUR),
      rule.withinMs,
      formatDuration,
    ),
    String(rule.withinMs),
    `rule-${index}-within`,
    (value) => change({ withinMs: Number(value) }),
  )
  const left = chip(
    'Unused at least',
    numberOptions(LEFT_PERCENTS, rule.minLeftPercent, (value) => `${value}%`),
    String(rule.minLeftPercent),
    `rule-${index}-left`,
    (value) => change({ minLeftPercent: Number(value) }),
  )
  const remove = iconButton('Remove alert', 'trash', `rule-${index}-remove`, () =>
    onSave(rules.filter((_, i) => i !== index)),
  )
  return el(
    'div',
    `rule lvl-${rule.level}`,
    el('i', 'dot'),
    level,
    el('span', 'cond', '≤', within, 'to reset'),
    el('span', 'cond', '≥', left, 'left'),
    remove,
  )
}

function alertsSection(rules: AlertRule[], onSave: (rules: AlertRule[]) => void): HTMLElement {
  const restore = el('button', 'text-link', 'Restore defaults')
  restore.type = 'button'
  restore.dataset.focus = 'defaults'
  restore.addEventListener('click', () => onSave(DEFAULT_ALERT_RULES))
  return el(
    'section',
    'settings-section',
    el(
      'div',
      'section-head',
      el('h2', 'section-label', 'Alerts'),
      iconButton('Add alert', 'plus', 'add', () => onSave([...rules, NEW_RULE])),
    ),
    el('p', 'section-hint', 'Warn me when a reset is close and a lot is still unused.'),
    rules.length === 0
      ? el('p', 'section-hint faint', 'No alerts: nothing turns yellow or red.')
      : el('div', 'rules', ...rules.map((rule, index) => ruleRow(rules, rule, index, onSave))),
    restore,
  )
}

function statusBarSection(preferences: Preferences, onSave: (preferences: Preferences) => void): HTMLElement {
  const row = el(
    'button',
    'setting',
    el(
      'span',
      'setting-text',
      el('span', 'setting-title', 'Show in the status bar'),
      el('span', 'setting-hint', "The most pressing account, next to Orca's usage."),
    ),
    el('i', 'switch'),
  )
  row.type = 'button'
  row.setAttribute('role', 'switch')
  row.setAttribute('aria-checked', String(preferences.showStatusBar))
  row.dataset.focus = 'show-status-bar'
  row.addEventListener('click', () => onSave({ ...preferences, showStatusBar: !preferences.showStatusBar }))
  return el('section', 'settings-section', el('h2', 'section-label', 'Status bar'), row)
}

/** `preferences` is null until the worker has answered them; their section waits for it. */
export function settingsView(
  rules: AlertRule[],
  preferences: Preferences | null,
  error: string | null,
  actions: SettingsActions,
): HTMLElement {
  return el(
    'div',
    'panel',
    el(
      'div',
      'toolbar settings-head',
      iconButton('Back', 'back', 'back', actions.showAccounts),
      el('h1', 'settings-title', 'Settings'),
      el('span', 'toolbar-error', error ?? ''),
    ),
    alertsSection(rules, actions.saveRules),
    preferences ? statusBarSection(preferences, actions.savePreferences) : '',
  )
}
