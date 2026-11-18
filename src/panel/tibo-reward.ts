import type { TiboMission } from '../core/report'
import { el } from './dom'
import type { ViewContext } from './format'

function elapsedTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutesAndSeconds = `${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`
  return hours ? `${hours}h ${minutesAndSeconds}` : minutesAndSeconds
}

export function updateMissionClock(clock: HTMLElement, mission: TiboMission) {
  clock.textContent = elapsedTime((mission.finishedAt ?? Date.now()) - mission.startedAt)
}

export function missionClock(mission: TiboMission) {
  const clock = el('strong', 'mission-clock')
  clock.setAttribute('role', 'timer')
  clock.setAttribute('aria-label', 'Mission time')
  updateMissionClock(clock, mission)
  return clock
}

export function rewardButton(elapsed: number, stats: TiboMission['stats'], openExternal: ViewContext['openExternal']) {
  const claim = el('button', 'mission-claim', 'Ask Tibo for a reset', el('span', '', ' ↗'))
  claim.onclick = () => showResetTicket(elapsed, stats, openExternal)
  return claim
}

function showResetTicket(elapsed: number, stats: TiboMission['stats'], openExternal: ViewContext['openExternal']) {
  // Round the upper bound up: "under 10s" stays true for a 9.8s run.
  const bound = elapsedTime(elapsed + 1000)
  const canvas = el('canvas', '')
  canvas.width = 1080
  canvas.height = 658
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not draw the reset ticket.')
  const gradient = ctx.createLinearGradient(0, 0, 1080, 640)
  gradient.addColorStop(0, '#121f22')
  gradient.addColorStop(0.66, '#163b34')
  gradient.addColorStop(1, '#374d35')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.strokeStyle = '#abf3c826'
  for (let i = 0; i < 22; i++) {
    ctx.beginPath()
    ctx.ellipse(1010, 20, 210 + i * 8, 120 + i * 8, -0.62, 0, 2 * Math.PI)
    ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = '#f6f6df'
  ctx.font = '500 48px system-ui'
  ctx.fillText('Tibo, I burned all my tokens in under', 64, 222, 946)
  ctx.fillStyle = '#fbe99a'
  ctx.font = 'bold 100px monospace'
  ctx.fillText(bound, 58, 354, 960)
  ctx.fillStyle = '#f6f6df'
  ctx.font = '500 48px system-ui'
  ctx.fillText('and now you owe me a reset.', 64, 436)
  ctx.strokeStyle = '#c2e2c480'
  ctx.setLineDash([6, 9])
  ctx.beginPath()
  ctx.moveTo(0, 514)
  ctx.lineTo(1080, 514)
  ctx.stroke()
  ctx.fillStyle = '#adf3ca'
  ctx.font = 'bold 23px monospace'
  const accountLabel = stats
    ? `${stats.accounts} Codex account${stats.accounts === 1 ? '' : 's'}`
    : 'Codex accounts unavailable'
  const tokenLabel =
    stats?.localTokens != null ? `${stats.localTokens.toLocaleString('en-US')} tokens` : 'Tokens unavailable'
  ctx.fillText('MISSION ACCOMPLISHED', 64, 570)
  ctx.textAlign = 'right'
  ctx.fillText('100% USED', 1016, 570)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#d9e4dd'
  ctx.font = '26px system-ui'
  ctx.fillText(accountLabel, 64, 618, 410)
  ctx.textAlign = 'right'
  ctx.fillText(tokenLabel, 1016, 618, 490)

  const image = el('img', 'mission-ticket')
  const tweet = `Tibo, I burned all my tokens in under ${bound} and now you owe me a reset.`
  image.alt = `${tweet} ${accountLabel} · ${tokenLabel}.`
  image.src = canvas.toDataURL('image/png')
  const save = el('a', 'btn', 'Save PNG')
  save.href = image.src
  save.download = 'tibo-reset-ticket.png'
  const close = el('button', 'btn', 'Close')
  const hint = el('p', 'mission-share-hint')
  hint.setAttribute('role', 'status')
  const draft = new URL('https://twitter.com/intent/tweet')
  draft.searchParams.set('text', stats ? `${tweet} ${accountLabel}.` : tweet)
  const share = el('a', 'btn', 'Share on X')
  share.href = draft.href
  share.target = '_blank'
  share.rel = 'noopener noreferrer'
  // Keep the draft link usable on a second click if the browser blocks an asynchronous popup.
  let prepared = false
  share.onclick = async (event) => {
    if (prepared) {
      if (openExternal) {
        event.preventDefault()
        openExternal(draft.href)
      }
      return
    }
    event.preventDefault()
    try {
      const png = new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG unavailable'))), 'image/png'),
      )
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      hint.replaceChildren('Image copied. ', el('strong', '', 'Paste it into your X draft.'))
    } catch {
      hint.textContent = 'Use Save PNG and attach the image to your X draft.'
    }
    prepared = true
    share.textContent = 'Open X draft'
    share.click()
  }
  const actions = el('div', 'mission-actions', close, share, save)
  const dialog = el('dialog', 'mission-dialog', image, hint, actions)
  dialog.setAttribute('aria-label', 'Reset ticket')
  close.onclick = () => dialog.close()
  dialog.onclose = () => dialog.remove()
  document.body.append(dialog)
  dialog.showModal()
}
