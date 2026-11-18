// The bar is the window: the fill is what was used, the tick is how much of its time has passed.
// Where the tick is ahead of the fill, the stretch between them is hatched: plan that should be spent by now.
// It is slim at rest; hovering thickens it and shows the share used.
import type { WindowReport } from '../core/report'
import { el } from './dom'
import { percent } from './format'

/** Below this share the fill is too short to hold its own label, so the label sits just after it. */
const LABEL_FITS_INSIDE = 15

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
  const inside = used >= LABEL_FITS_INSIDE
  const label = el('span', inside ? 'pace-label in' : 'pace-label out', percent(used))
  if (inside) label.style.right = `${100 - used}%`
  else label.style.left = `${used}%`
  bar.append(label)

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
