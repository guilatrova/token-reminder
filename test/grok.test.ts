import { assert, test } from 'orca/testing'
import { grokUsage } from '../src/adapters/grok'

const NOW = Date.parse('2027-01-10T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const auth = (entries: Record<string, unknown>) => JSON.stringify(entries)
const login = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  user_id: 'user-1',
  email: 'person@example.com',
  ...extra,
})

/** Answers each URL from `routes`, by its ending; anything else is a 500. */
function routed(routes: Record<string, unknown>, seen: string[] = []): typeof fetch {
  return async (input, init) => {
    const url = String(input)
    seen.push(`${url} ${new Headers(init?.headers).get('Authorization')}`)
    const body = Object.entries(routes).find(([ending]) => url.endsWith(ending))?.[1]
    return new Response(JSON.stringify(body ?? {}), { status: body === undefined ? 500 : 200 })
  }
}

function source(authText: string | null, fetcher: typeof fetch) {
  return grokUsage({ authFile: '/grok/auth.json', readFile: async () => authText, fetch: fetcher, now: () => NOW })
}

test('reads the weekly allowance with the period it covers, using xAI own sign-in first', async () => {
  const seen: string[] = []
  const file = auth({ 'https://other.example': login('other'), 'https://auth.x.ai': login('main') })
  const billing = {
    config: {
      creditUsagePercent: 11,
      subscriptionTier: 'SuperGrok',
      currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', start: '2027-01-08T00:00:00Z', end: '2027-01-15T00:00:00Z' },
    },
  }
  assert.deepEqual(await source(file, routed({ 'format=credits': billing }, seen)).read(), [
    {
      status: 'ok',
      account: 'person@example.com',
      plan: 'SuperGrok',
      windows: [{ kind: 'weekly', lengthMs: 7 * DAY, usedPercent: 11, resetsAt: Date.parse('2027-01-15T00:00:00Z') }],
      resetCredits: null,
    },
  ])
  assert.deepEqual(seen, ['https://cli-chat-proxy.grok.com/v1/billing?format=credits Bearer main'])
})

test('falls back to the monthly budget, from the default view when the credits view has none', async () => {
  const file = auth({ 'https://auth.x.ai': login('main') })
  const budget = { monthlyLimit: { val: '200' }, used: { val: '50.0' }, billingPeriodEnd: '2027-02-01T00:00:00Z' }
  const [reading] = await source(
    file,
    routed({ 'format=credits': { subscriptionTier: 'X Premium+' }, '/billing': budget }),
  ).read()
  assert.deepEqual(reading?.status === 'ok' && reading.windows, [
    { kind: 'monthly', lengthMs: 30 * DAY, usedPercent: 25, resetsAt: Date.parse('2027-02-01T00:00:00Z') },
  ])
})

test('says so when nothing reports the share used, when the login expired, and when nobody is signed in', async () => {
  const file = auth({ 'https://auth.x.ai': login('main') })
  const [silent] = await source(
    file,
    routed({ 'format=credits': {}, '/billing': { prepaidBalance: { val: '3' } } }),
  ).read()
  assert.deepEqual(silent?.status === 'unavailable' && [silent.reason, silent.detail], [
    'unexpected-response',
    'Grok did not report how much of this plan is used.',
  ])

  const never: typeof fetch = () => Promise.reject(new Error('must not be called'))
  const expired = auth({ 'https://auth.x.ai': login('main', { expires_at: '2027-01-09T00:00:00Z' }) })
  const [stale] = await source(expired, never).read()
  assert.deepEqual(stale?.status === 'unavailable' && stale.reason, 'login-expired')

  assert.deepEqual(await source(null, never).read(), [])
  assert.deepEqual(await source(auth({ 'https://auth.x.ai': { email: 'signed-out@example.com' } }), never).read(), [])
})
