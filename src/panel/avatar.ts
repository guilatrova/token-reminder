// A provider's face: its own mark, or its first two letters when it has none.
import { el } from './dom'
import { PROVIDER_MARKS } from './provider-marks'

export function avatar(provider: string, size: 'row' | 'small' = 'row'): HTMLElement {
  const sized = size === 'small' ? 'avatar small' : 'avatar'
  const mark = PROVIDER_MARKS[provider.toLowerCase()]
  if (!mark) return el('span', sized, provider.slice(0, 2))
  const node = el('span', `${sized} mark`)
  node.innerHTML = mark // our own static markup, no data
  return node
}
