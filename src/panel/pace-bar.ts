// The bar is the window: the fill is what was used, the tick is how much of its time has passed.
// Where the tick is ahead of the fill, the stretch between them is hatched: plan that should be spent by now.
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
      hatch.style.left = `${window.usedPercent}%`
      hatch.style.width = `${atRiskPercent}%`
      bar.append(hatch)
    }
    const tick = el('div', 'tick')
    tick.style.right = `${timeLeftPercent}%`
    bar.append(tick)
  }
  const width = `${window.usedPercent}%`
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
