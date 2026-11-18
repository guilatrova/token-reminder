// One account: a single line that opens into its detail, or a plain line when the account is unavailable.
import type { AccountReport, OkAccountReport } from '../core/report'
import { leftPercent } from '../core/usage'
import { accountDetail } from './account-detail'
import { el, icon } from './dom'
import { percent, shortDate, timeLeft, type ViewContext } from './format'
import { paceBar } from './pace-bar'
import { PROVIDER_MARKS } from './provider-marks'

function avatar(provider: string): HTMLElement {
  const mark = PROVIDER_MARKS[provider.toLowerCase()]
  if (!mark) return el('span', 'avatar', provider.slice(0, 2))
  const node = el('span', 'avatar mark')
  node.innerHTML = mark // our own static markup, no data
  return node
}

function tanks(account: OkAccountReport, ctx: ViewContext): HTMLElement {
  return el(
    'span',
    'tanks',
    ...account.resets.map((reset) => {
      const tank = el('i', `tank lvl-${reset.alert?.level ?? 'ok'}`)
      tank.title =
        reset.expiresAt === null
          ? 'Unused reset, expiry unknown'
          : `Unused reset, expires ${shortDate(reset.expiresAt, ctx.locale)}`
      return tank
    }),
  )
}

function okAccount(account: OkAccountReport, ctx: ViewContext): HTMLElement {
  const { key } = account
  const open = ctx.opened.get(key) ?? account.level !== 'ok'
  const main = account.windows[0]
  const row = el(
    'button',
    'row',
    avatar(account.provider),
    el('span', 'who', el('span', 'name', account.provider), el('span', 'plan', account.plan ?? '')),
    main ? paceBar(main, false, ctx.animate) : el('span', ''),
    tanks(account, ctx),
    main ? el('span', 'pct', percent(leftPercent(main)), el('small', '', ' left')) : el('span', 'pct none', '–'),
    el('span', 'time', main?.resetsAt != null ? timeLeft(main.resetsAt, ctx.readAt) : '–'),
    el('span', 'chev', icon('chevron')),
  )
  row.type = 'button'
  row.setAttribute('aria-expanded', String(open))
  const detail = accountDetail(account, ctx)
  detail.inert = !open
  const section = el('section', `acct lvl-${account.level}${open ? ' open' : ''}`, row, detail)
  // Toggled in place, so the panel is not redrawn and the open row does not replay its animation.
  row.addEventListener('click', () => {
    const next = !section.classList.contains('open')
    section.classList.toggle('open', next)
    row.setAttribute('aria-expanded', String(next))
    detail.inert = !next
    ctx.onToggle(key, next)
  })
  return section
}

export function accountRow(account: AccountReport, ctx: ViewContext): HTMLElement {
  if (account.status === 'ok') return okAccount(account, ctx)
  const row = el('div', 'row static', avatar(account.provider), el('span', 'who', el('span', 'name', account.provider)))
  row.append(el('span', 'unavailable', 'Unavailable'))
  const reason = el('div', 'reason')
  if (account.account) reason.append(el('div', 'who-email', account.account))
  reason.append(el('div', '', account.detail))
  return el('section', 'acct lvl-warning', row, reason)
}
