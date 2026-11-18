// The bar is the window: the fill is what was used, the tick is how much of its time has passed.
// Where the tick is ahead of the fill, the stretch between them is hatched: plan that should be spent by now.
// The account's plan rules are dashed marks on it: the share that must be used by then for the rule to stay quiet.
// It is slim at rest; hovering thickens it and shows the share used in a tooltip. Hovering a mark
// thickens the mark instead and says how far the usage is from it.
import { describeRule } from '../core/alerts'
import type { WindowReport } from '../core/report'
import { RULE_LEVEL_LABEL } from '../tones'
import { el } from './dom'
import { percent } from './format'

export function paceBar(window: WindowReport, big: boolean, animate: boolean): HTMLElement {
  const used = window.usedPercent
  const fill = el('div', 'fill')
  const track = el('div', 'track', fill)
  const bar = el('div', big ? 'pace big' : 'pace', track)
  const { timeLeftPercent, atRiskPercent } = window
  if (timeLeftPercent !== null) {
    if (atRiskPercent !== null && atRiskPercent > 0) {
      const hatch = el('div', 'hatch')
      hatch.style.left = `${used}%`
      hatch.style.width = `${atRiskPercent}%`
      track.append(hatch)
    }
    const tick = el('div', 'tick')
    tick.style.right = `${timeLeftPercent}%`
    bar.append(tick)
  }
  for (const mark of window.marks) {
    const line = el('i', `rule-mark lvl-${mark.rule.level}`)
    line.style.left = `${mark.usedPercent}%`
    // Slides with the mark, so a tooltip near either end of the bar stays inside the panel.
    const about = el(
      'span',
      'tip mark-tip',
      el('b', '', `${percent(mark.aheadPercent)} to go`),
      el('span', '', `${RULE_LEVEL_LABEL[mark.rule.level]}: ${describeRule(mark.rule, 'plan')}`),
    )
    about.style.left = `${mark.usedPercent}%`
    about.style.transform = `translateX(-${mark.usedPercent}%)`
    bar.append(line, about)
  }
  // Anchored to the end of the fill, kept clear of the bar's ends so the panel never clips it.
  const tip = el('span', 'tip used-tip', `${percent(used)} used`)
  tip.style.left = `clamp(24px, ${used}%, calc(100% - 24px))`
  bar.append(tip)

  const width = `${used}%`
  if (!animate) {
    fill.style.width = width
    return bar
  }
  bar.classList.add('grow')
  // Two frames, so the browser has painted width 0 before the transition starts.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      fill.style.width = width
      bar.classList.add('go')
    }),
  )
  return bar
}
