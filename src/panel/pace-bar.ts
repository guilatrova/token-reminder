// The plan is the bar, the clock is the tick: fill = plan left, tick = time left, hatch = plan on course to go unused.
import { leftPercent } from '../core/usage'
import type { WindowReport } from '../core/report'
import { el } from './dom'

export function paceBar(window: WindowReport, big: boolean, animate: boolean): HTMLElement {
  const bar = el('div', big ? 'pace big' : 'pace')
  const fill = el('div', 'fill')
  bar.append(fill)
  const { timeLeftPercent, atRiskPercent } = window
  if (timeLeftPercent !== null) {
    if (atRiskPercent !== null && atRiskPercent > 0) {
      const hatch = el('div', 'hatch')
      hatch.style.left = `${timeLeftPercent}%`
      hatch.style.width = `${atRiskPercent}%`
      bar.append(hatch)
    }
    const tick = el('div', 'tick')
    tick.style.left = `${timeLeftPercent}%`
    bar.append(tick)
  }
  const width = `${leftPercent(window)}%`
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
