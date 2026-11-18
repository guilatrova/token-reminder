// The alert rules: one row per rule with three selects. Every change hands the whole new list to `onSave`.
import { DEFAULT_ALERT_RULES, formatDuration, type AlertRule } from '../core/alerts'
import { el, icon, iconButton } from './dom'

const HOUR = 60 * 60 * 1000
const WITHIN_HOURS = [6, 10, 12, 24, 48, 72, 120, 168]
const LEFT_PERCENTS = [10, 20, 30, 40, 50, 60, 70, 80, 90]
const NEW_RULE: AlertRule = { withinMs: 24 * HOUR, minLeftPercent: 50, level: 'warning' }

type Option = { value: string; text: string }

function field(label: string, options: Option[], current: string, focusKey: string, onChange: (value: string) => void) {
  const select = el('select', '')
  for (const option of options) select.append(new Option(option.text, option.value))
  select.value = current
  select.dataset.focus = focusKey
  select.addEventListener('change', () => onChange(select.value))
  return el('label', 'field', el('span', '', label), select)
}

/** The list plus the rule's own value, so a saved rule that is not in the list still shows. */
function numberOptions(values: number[], current: number, text: (value: number) => string): Option[] {
  return [...new Set([...values, current])]
    .sort((a, b) => a - b)
    .map((value) => ({ value: String(value), text: text(value) }))
}

function ruleRow(
  rules: AlertRule[],
  rule: AlertRule,
  index: number,
  onSave: (rules: AlertRule[]) => void,
): HTMLElement {
  const change = (patch: Partial<AlertRule>) =>
    onSave(rules.map((other, i) => (i === index ? { ...other, ...patch } : other)))
  return el(
    'div',
    `rule lvl-${rule.level}`,
    el('i', 'bar'),
    field(
      'Reset within',
      numberOptions(
        WITHIN_HOURS.map((hours) => hours * HOUR),
        rule.withinMs,
        formatDuration,
      ),
      String(rule.withinMs),
      `rule-${index}-within`,
      (value) => change({ withinMs: Number(value) }),
    ),
    field(
      'Unused at least',
      numberOptions(LEFT_PERCENTS, rule.minLeftPercent, (value) => `${value}%`),
      String(rule.minLeftPercent),
      `rule-${index}-left`,
      (value) => change({ minLeftPercent: Number(value) }),
    ),
    field(
      'Alert',
      [
        { value: 'warning', text: 'Yellow' },
        { value: 'urgent', text: 'Red' },
      ],
      rule.level,
      `rule-${index}-level`,
      (value) => change({ level: value === 'urgent' ? 'urgent' : 'warning' }),
    ),
    iconButton('Remove rule', 'trash', `rule-${index}-remove`, () => onSave(rules.filter((_, i) => i !== index))),
  )
}

function textButton(label: string, className: string, focusKey: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', className, label)
  button.type = 'button'
  button.dataset.focus = focusKey
  button.addEventListener('click', onClick)
  return button
}

export function rulesView(
  rules: AlertRule[],
  error: string | null,
  onSave: (rules: AlertRule[]) => void,
  onBack: () => void,
): HTMLElement {
  const back = el('button', 'back', icon('back'), 'Alert rules')
  back.type = 'button'
  back.dataset.focus = 'back'
  back.addEventListener('click', onBack)
  return el(
    'div',
    'panel',
    back,
    el('p', 'hint', 'Warn me when a reset is close and a lot is still unused.'),
    error === null ? '' : el('p', 'error', error),
    el('div', 'rules', ...rules.map((rule, index) => ruleRow(rules, rule, index, onSave))),
    el(
      'div',
      'rule-actions',
      textButton('+ Add rule', 'btn', 'add', () => onSave([...rules, NEW_RULE])),
      textButton('Defaults', 'btn ghost', 'defaults', () => onSave(DEFAULT_ALERT_RULES)),
    ),
  )
}
