// Tiny DOM helpers. Text always goes in through textContent, never as markup.
import { ICONS, type IconName } from './icons'

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.append(...children)
  return node
}

export function icon(name: IconName): HTMLElement {
  const node = el('span', 'icon')
  node.innerHTML = ICONS[name] // our own static SVG, no data
  return node
}

/**
 * A label whose explanation shows on demand: an info mark after it, and a tooltip when either is pointed at.
 * `tag` is `span` where only phrasing content is allowed, such as inside a button.
 */
export function hinted(tag: 'div' | 'span', label: HTMLElement, hint: string): HTMLElement {
  const tip = el('span', 'tip hint-tip', hint)
  tip.setAttribute('role', 'tooltip')
  label.setAttribute('aria-description', hint)
  return el(tag, 'hinted', label, icon('info'), tip)
}

/** `focusKey` lets the panel put focus back on the same control after it redraws. */
export function iconButton(label: string, name: IconName, focusKey: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'icon-btn', icon(name))
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  button.dataset.focus = focusKey
  button.addEventListener('click', onClick)
  return button
}
