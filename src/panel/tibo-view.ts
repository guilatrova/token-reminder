import type { weeklyUsage } from '../core/report'
import { el, icon } from './dom'

function portrait() {
  const image = el('img', 'tibo-portrait')
  image.src = 'tibo.jpg'
  image.alt = ''
  return image
}

export function tiboMenu(active: boolean, setMode: (active: boolean) => void) {
  const trigger = el('button', 'tibo-trigger', portrait())
  trigger.dataset.focus = 'tibo'
  trigger.title = 'Tibo Reset mode'
  trigger.setAttribute('aria-label', trigger.title)
  const menu = el('div', 'tibo-menu')
  menu.popover = 'auto'
  trigger.popoverTargetElement = menu
  const action = el(
    'button',
    'tibo-action',
    icon(active ? 'back' : 'play'),
    active ? 'Leave Tibo Reset mode' : 'Start',
    el('span', 'tibo-action-arrow', '→'),
  )
  action.onclick = () => {
    menu.hidePopover()
    trigger.focus()
    setMode(!active)
  }
  menu.append(
    el('header', 'tibo-menu-head', portrait(), el('strong', '', 'Tibo Reset')),
    action,
    el(
      'details',
      'tibo-help',
      el('summary', '', icon('info'), "What's a Tibo Reset Mode?", icon('chevron')),
      el('p', '', 'Track all your Codex accounts and spend your weekly quota ASAP!'),
    ),
  )
  return el('span', 'tibo-control', trigger, menu)
}

const quips = [
  "You ain't gonna burn all these tokens in time pal haha",
  'A quarter gone. Did you ask Codex to name a variable?',
  'Halfway. Whatever you do, don’t let it say “looks good to me.”',
  'Okay, who told the agents they could spawn agents?',
  'I went to press reset and you ate the whole button.',
]

export function tiboPost(weekly: ReturnType<typeof weeklyUsage>, total: number) {
  const { percent, count } = weekly
  const complete = percent === 100 && count === total
  const milestone = percent === null ? null : Math.min(complete ? 4 : 3, Math.floor(percent / 25))
  const name = el('div', 'tibo-byline', el('strong', '', 'Tibo'), icon('verified'))
  const author = el(
    'header',
    'tibo-author',
    portrait(),
    el('div', '', name, el('small', '', 'Replying to ', el('b', '', '@you'))),
    el('small', 'tibo-parody', 'Parody'),
  )
  const text = milestone === null ? 'Anybody seen my tokens? Still waiting for weekly usage.' : quips[milestone]!
  const post = el('article', 'tibo-post', author, el('p', 'tibo-quip', text))
  post.dataset.complete = String(complete)
  const meter = el('progress', 'tibo-meter')
  meter.max = 100
  if (percent !== null) meter.value = percent
  meter.setAttribute('aria-label', 'Average weekly Codex quota used')
  const number = percent === null ? '—' : Math.floor(percent) + '%'
  post.append(
    el(
      'div',
      'tibo-stats',
      el('span', '', complete ? 'Mission accomplished' : 'Weekly quota used'),
      el('strong', '', number),
    ),
    meter,
  )
  if (count < total) post.append(el('small', 'tibo-coverage', `Usage available for ${count} of ${total} accounts`))
  return post
}

/** Runs on mission entry or the first complete report, after the worker's render burst settles. */
export function animateMission(post: HTMLElement, entering: boolean, achieved: boolean) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (entering) {
    post.animate(
      [
        { opacity: 0, transform: 'translateY(-10px) scale(.98)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 440, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    post.parentElement?.querySelectorAll('.acct').forEach((row, i) =>
      row.animate(
        [
          { opacity: 0, transform: 'translateY(9px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 340, delay: 95 + Math.min(i, 6) * 35, fill: 'backwards' },
      ),
    )
  }
  if (!achieved) return
  const colors = ['#ffce59', '#ff639a', '#72efcd', '#a5a0ff']
  for (let i = 0; i < 32; i++) {
    const spark = el('i', 'tibo-spark')
    spark.setAttribute('aria-hidden', 'true')
    const side = i % 2
    spark.style.left = side ? '96%' : '4%'
    spark.style.background = colors[i % colors.length]!
    post.append(spark)
    const x = (side ? -1 : 1) * (15 + ((i * 41) % 170))
    const y = -(40 + ((i * 17) % 95))
    spark.animate(
      [
        { transform: 'translate(0,0) rotate(0)', opacity: 0 },
        { transform: `translate(${x * 0.7}px,${y}px) rotate(${i * 14}deg)`, opacity: 1, offset: 0.42 },
        { transform: `translate(${x}px,15px) rotate(${i * 35}deg)`, opacity: 0 },
      ],
      { duration: 950 + i * 13, delay: (i % 5) * 40, easing: 'ease-out' },
    ).onfinish = () => spark.remove()
  }
}
