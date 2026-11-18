// The preview page's script: stands in for Orca, then runs the real panel.
import { fakeWorker } from './scenarios'

const params = new URLSearchParams(location.search)
document.documentElement.className = params.get('theme') ?? 'dark'
const nothing = () => ({ dispose() {} })
Object.assign(window, {
  orca: {
    locale: 'en-US',
    plugin: { request: fakeWorker(params.get('scenario') ?? 'today'), on: nothing },
    on: nothing,
    shell: { openExternal: async (url: string) => (console.log('openExternal', url), { opened: true }) },
  },
})
await import('../../src/panel/main')
