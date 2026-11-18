// The settings: the alert rules as one sentence per rule, for everyone or for one account, and the
// plugin's own preferences. Every change is handed over at once; nothing here keeps a draft.
import {
  DEFAULT_ALERT_RULES,
  formatDuration,
  RULE_DEADLINE,
  RULE_KINDS,
  withRuleList,
  type AlertRule,
  type AlertRules,
  type RuleKind,
  type RuleLevel,
} from '../core/alerts'
import type { AccountReport, UsageReport } from '../core/report'
import type { Preferences } from '../preferences'
import { RULE_KIND_LABEL, RULE_LEVEL_LABEL } from '../tones'
import { el, iconButton } from './dom'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const LEVELS = Object.keys(RULE_LEVEL_LABEL) as RuleLevel[]

/** What each kind of rule offers and says. A reset lasts a month, a plan window a week or so. */
const KINDS: Record<RuleKind, { hint: string; within: number[]; left: number[]; added: AlertRule }> = {
  plan: {
    hint: 'Warn me when a plan reset is close and a lot is still unused. Each rule is a mark on the bar.',
    within: [6, 10, 12, 24, 48, 72, 120, 168].map((hours) => hours * HOUR),
    left: [10, 20, 30, 40, 50, 60, 70, 80, 90],
    added: { withinMs: DAY, minLeftPercent: 50, level: 'warning' },
  },
  reset: {
    hint: 'Warn me when a rate limit reset is about to expire unused.',
    within: [1, 2, 3, 5, 7, 10, 14, 21, 30].map((days) => days * DAY),
    left: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
    added: { withinMs: 5 * DAY, minLeftPercent: 0, level: 'warning' },
  },
}

export type SettingsActions = {
  saveRules: (rules: AlertRules) => void
  savePreferences: (preferences: Preferences) => void
  /** Whose rules are on screen: an account's key, or null for the general ones. */
  showScope: (accountKey: string | null) => void
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

function ruleRow(
  kind: RuleKind,
  rules: AlertRule[],
  rule: AlertRule,
  index: number,
  onSave: (rules: AlertRule[]) => void,
) {
  const change = (patch: Partial<AlertRule>) =>
    onSave(rules.map((other, i) => (i === index ? { ...other, ...patch } : other)))
  const focus = `${kind}-${index}`
  const level = chip(
    'Alert colour',
    LEVELS.map((value) => ({ value, text: RULE_LEVEL_LABEL[value] })),
    rule.level,
    `${focus}-level`,
    (value) => change({ level: LEVELS.find((known) => known === value) ?? rule.level }),
  )
  level.classList.add('level')
  const within = chip(
    kind === 'plan' ? 'Reset within' : 'Expires within',
    numberOptions(KINDS[kind].within, rule.withinMs, formatDuration),
    String(rule.withinMs),
    `${focus}-within`,
    (value) => change({ withinMs: Number(value) }),
  )
  const left = chip(
    'Unused at least',
    numberOptions(KINDS[kind].left, rule.minLeftPercent, (value) => `${value}%`),
    String(rule.minLeftPercent),
    `${focus}-left`,
    (value) => change({ minLeftPercent: Number(value) }),
  )
  const remove = iconButton('Remove rule', 'trash', `${focus}-remove`, () =>
    onSave(rules.filter((_, i) => i !== index)),
  )
  return el(
    'div',
    `rule lvl-${rule.level}`,
    el('i', 'dot'),
    level,
    el('span', 'cond', '≤', within, RULE_DEADLINE[kind]),
    el('span', 'cond', '≥', left, 'left'),
    remove,
  )
}

function textLink(label: string, focusKey: string, onClick: () => void): HTMLButtonElement {
  const link = el('button', 'text-link', label)
  link.type = 'button'
  link.dataset.focus = focusKey
  link.addEventListener('click', onClick)
  return link
}

/** One kind of rule for the scope on screen. An account's group either follows general or is its own list. */
function ruleGroup(
  kind: RuleKind,
  rules: AlertRules,
  scope: string | null,
  onSave: (rules: AlertRules) => void,
): HTMLElement {
  const save = (list: AlertRule[] | null) => onSave(withRuleList(rules, scope, kind, list))
  const general = rules.general[kind]
  const own = scope === null ? general : rules.accounts[scope]?.[kind]
  const title = el('h3', 'group-title', RULE_KIND_LABEL[kind])
  if (own === undefined) {
    return el(
      'section',
      'rule-group',
      el('div', 'section-head', title),
      el('p', 'section-hint', 'Follows the general rules.'),
      textLink('Customize', `${kind}-customize`, () => save(general)),
    )
  }
  return el(
    'section',
    'rule-group',
    el(
      'div',
      'section-head',
      title,
      iconButton('Add rule', 'plus', `${kind}-add`, () => save([...own, KINDS[kind].added])),
    ),
    el('p', 'section-hint', KINDS[kind].hint),
    own.length === 0
      ? el('p', 'section-hint faint', 'No rules: nothing turns yellow or red.')
      : el('div', 'rules', ...own.map((rule, index) => ruleRow(kind, own, rule, index, save))),
    scope === null
      ? textLink('Restore defaults', `${kind}-defaults`, () => save(DEFAULT_ALERT_RULES.general[kind]))
      : textLink('Use the general rules', `${kind}-follow`, () => save(null)),
  )
}

/** A provider's name, with the login when the person has more than one account there. */
function scopeLabels(accounts: AccountReport[]): Map<string, string> {
  const perProvider = new Map<string, number>()
  for (const account of accounts) perProvider.set(account.provider, (perProvider.get(account.provider) ?? 0) + 1)
  return new Map(
    accounts.map((account) => {
      const shared = (perProvider.get(account.provider) ?? 0) > 1 && account.account
      return [account.key, shared ? `${account.provider} · ${account.account}` : account.provider]
    }),
  )
}

function alertsSection(
  rules: AlertRules,
  accounts: AccountReport[],
  scope: string | null,
  actions: SettingsActions,
): HTMLElement {
  const tab = (label: string, key: string | null) => {
    const button = el('button', 'scope', label)
    button.type = 'button'
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-selected', String(key === scope))
    button.dataset.focus = `scope-${key ?? ''}`
    button.addEventListener('click', () => actions.showScope(key))
    return button
  }
  const tabs = el('div', 'scopes', tab('General', null))
  tabs.setAttribute('role', 'tablist')
  for (const [key, label] of scopeLabels(accounts)) tabs.append(tab(label, key))
  return el(
    'section',
    'settings-section',
    el('h2', 'section-label', 'Alerts'),
    tabs,
    ...RULE_KINDS.map((kind) => ruleGroup(kind, rules, scope, actions.saveRules)),
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
  report: Pick<UsageReport, 'rules' | 'accounts'>,
  preferences: Preferences | null,
  scope: string | null,
  error: string | null,
  actions: SettingsActions,
): HTMLElement {
  // An account that is no longer reported has no tab, so its rules cannot be on screen.
  const shown = report.accounts.some((account) => account.key === scope) ? scope : null
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
    alertsSection(report.rules, report.accounts, shown, actions),
    preferences ? statusBarSection(preferences, actions.savePreferences) : '',
  )
}
