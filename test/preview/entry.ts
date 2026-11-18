// The preview page's script: stands in for Orca, then runs the real panel.
import type { UsageReport } from '../../src/core/report'
import { fakeWorker } from './scenarios'

const params = new URLSearchParams(location.search)
document.documentElement.className = params.get('theme') ?? 'dark'
const nothing = () => ({ dispose() {} })
const controls = document.querySelector('#milestones')
let percent = 75
const request = fakeWorker(params.get('scenario') ?? 'today', controls ? () => percent : undefined)
const events = new EventTarget()
if (controls) {
  for (const milestone of [0, 25, 50, 75, 100]) {
    const button = document.createElement('button')
    button.className = 'btn'
    button.textContent = milestone + '%'
    button.setAttribute('aria-pressed', String(milestone === percent))
    button.onclick = async () => {
      percent = milestone
      controls
        .querySelectorAll('button')
        .forEach((other) => other.setAttribute('aria-pressed', String(other === button)))
      const report = await request('usage.latest')
      events.dispatchEvent(new CustomEvent('usage.changed', { detail: report }))
    }
    controls.append(button)
  }
}
Object.assign(window, {
  orca: {
    locale: 'en-US',
    plugin: {
      request,
      on(name: string, notify: (report: UsageReport) => void) {
        const listener = (event: Event) => notify((event as CustomEvent<UsageReport>).detail)
        events.addEventListener(name, listener)
        return { dispose: () => events.removeEventListener(name, listener) }
      },
    },
    on: nothing,
    shell: { openExternal: async (url: string) => (console.log('openExternal', url), { opened: true }) },
  },
})
await import('../../src/panel/main')
