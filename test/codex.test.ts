import { assert, test } from 'orca/testing'
import { codexUsage } from '../src/adapters/codex'
import resetCredits from './fixtures/codex-reset-credits.json' with { type: 'json' }
import usage from './fixtures/codex-usage.json' with { type: 'json' }

function login(accountId: string, email: string): string {
  const idToken = `h.${btoa(JSON.stringify({ email }))}.s`
  return JSON.stringify({ tokens: { access_token: `token-${accountId}`, account_id: accountId, id_token: idToken } })
}

/** Answers each URL from `routes`; a missing route is a 500. */
function fakeFetch(routes: Record<string, { status?: number; body?: unknown }>, calls: string[] = []): typeof fetch {
  return async (input, init) => {
    const url = String(input)
    calls.push(`${url} ${new Headers(init?.headers).get('ChatGPT-Account-Id')}`)
    const route = Object.entries(routes).find(([suffix]) => url.endsWith(suffix))?.[1] ?? { status: 500 }
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200 })
  }
}

const files = (entries: Record<string, string>) => async (path: string) => entries[path] ?? null

test('maps the plan window and when each available reset expires', async () => {
  const source = codexUsage({
    homes: ['/a', '/missing'],
    readFile: files({ '/a/auth.json': login('acc-1', 'person@example.com') }),
    fetch: fakeFetch({ '/usage': { body: usage }, '/rate-limit-reset-credits': { body: resetCredits } }),
  })
  assert.deepEqual(await source.read(), [
    {
      account: 'person@example.com',
      status: 'ok',
      plan: 'pro',
      windows: [{ kind: 'weekly', lengthMs: 604_800_000, usedPercent: 15, resetsAt: 1_800_000_000_000 }],
      resetCredits: {
        available: 2,
        expiresAt: [Date.parse('2027-01-20T00:00:00Z'), Date.parse('2027-02-01T00:00:00Z')],
      },
    },
  ])
})

test('keeps the reset count with unknown expiries when the detail call fails', async () => {
  const source = codexUsage({
    homes: ['/a'],
    readFile: files({ '/a/auth.json': login('acc-1', 'person@example.com') }),
    fetch: fakeFetch({ '/usage': { body: usage } }),
  })
  const [reading] = await source.read()
  assert.deepEqual(reading?.status === 'ok' && reading.resetCredits, { available: 2, expiresAt: [] })
})

test('reads each account once and reports a rejected login as unavailable', async () => {
  const calls: string[] = []
  const source = codexUsage({
    homes: ['/a', '/b', '/c'],
    readFile: files({
      '/a/auth.json': login('acc-1', 'one@example.com'),
      '/b/auth.json': login('acc-1', 'one@example.com'),
      '/c/auth.json': login('acc-2', 'two@example.com'),
    }),
    fetch: async (input, init) => {
      const expired = new Headers(init?.headers).get('ChatGPT-Account-Id') === 'acc-2'
      return fakeFetch(
        { '/usage': expired ? { status: 401 } : { body: { ...usage, rate_limit_reset_credits: null } } },
        calls,
      )(input, init)
    },
  })
  const readings = await source.read()
  assert.equal(calls.length, 2)
  assert.deepEqual(
    readings.map((reading) => [reading.account, reading.status, reading.status === 'unavailable' && reading.reason]),
    [
      ['one@example.com', 'ok', false],
      ['two@example.com', 'unavailable', 'login-expired'],
    ],
  )
})
