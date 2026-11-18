// The alert rules, edited in place: every change is saved at once and the report comes back
// judged by the new rules.
import { Button, IconButton, Row, Select, Stack, Text } from 'orca'
import { DEFAULT_ALERT_RULES, formatDuration, type AlertRule } from './core/alerts'

const HOUR = 60 * 60 * 1000
const WITHIN_CHOICES = [6, 10, 12, 24, 48, 72, 120, 168].map((hours) => hours * HOUR)
const LEFT_CHOICES = [10, 20, 30, 40, 50, 60, 70, 80, 90]
const LEVEL_OPTIONS = [
  { value: 'warning', label: 'Yellow' },
  { value: 'urgent', label: 'Red' },
]
const NEW_RULE: AlertRule = { withinMs: 24 * HOUR, minLeftPercent: 50, level: 'warning' }

/** The choices plus the rule's own value, so a value saved by an older version still shows. */
function options(choices: number[], current: number, label: (value: number) => string) {
  const values = [...new Set([...choices, current])].sort((a, b) => a - b)
  return values.map((value) => ({ value: String(value), label: label(value) }))
}

type Props = { rules: AlertRule[]; onChange: (rules: AlertRule[]) => void }

export function RulesEditor({ rules, onChange }: Props) {
  const replace = (index: number, change: Partial<AlertRule>) =>
    onChange(rules.map((rule, at) => (at === index ? { ...rule, ...change } : rule)))
  return (
    <Stack gap="sm">
      <Text size="sm" muted>
        Alert when a reset is this close and this much is still left.
      </Text>
      {rules.map((rule, index) => (
        <Row key={index} gap="xs">
          <Select
            label="Time to reset"
            labelHidden
            value={String(rule.withinMs)}
            options={options(WITHIN_CHOICES, rule.withinMs, formatDuration)}
            onChange={(value) => replace(index, { withinMs: Number(value) })}
          />
          <Select
            label="Share left"
            labelHidden
            value={String(rule.minLeftPercent)}
            options={options(LEFT_CHOICES, rule.minLeftPercent, (value) => `${value}%`)}
            onChange={(value) => replace(index, { minLeftPercent: Number(value) })}
          />
          <Select
            label="Color"
            labelHidden
            value={rule.level}
            options={LEVEL_OPTIONS}
            onChange={(value) => replace(index, { level: value === 'urgent' ? 'urgent' : 'warning' })}
          />
          <IconButton
            icon="delete"
            label="Remove rule"
            variant="ghost"
            onPress={() => onChange(rules.filter((_, at) => at !== index))}
          />
        </Row>
      ))}
      <Row gap="xs">
        <Button variant="outline" size="sm" icon="add" onPress={() => onChange([...rules, NEW_RULE])}>
          Add rule
        </Button>
        <Button variant="ghost" size="sm" onPress={() => onChange(DEFAULT_ALERT_RULES)}>
          Defaults
        </Button>
      </Row>
    </Stack>
  )
}
