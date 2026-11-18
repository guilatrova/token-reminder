import { assert, test } from 'orca/testing'
import { claudeKeychainAccount, claudeUsage } from '../src/adapters/claude'

const HOUR = 60 * 60 * 1000
const credentials = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ claudeAiOauth: { accessToken: 'token-1', subscriptionType: 'max', ...extra } })

function answering(status: number, body: unknown, seen: string[] = []): typeof fetch {
  return async (input, init) => {
    seen.push(`${String(input)} ${new Headers(init?.headers).get('Authorization')}`)
    return new Response(JSON.stringify(body), { status })
  }
}

test('maps the session and weekly windows and names the plan with its tier', async () => {
  const seen: string[] = []
  const source = claudeUsage({
    readCredentials: async () => credentials({ rateLimitTier: 'default_claude_max_20x' }),
    fetch: answering(
      200,
      {
        five_hour: { utilization: 24, resets_at: '2027-01-10T15:00:00Z' },
        seven_day: { utilization: 4.5, resets_at: 1_800_000_000 },
        seven_day_opus: null,
      },
      seen,
    ),
  })
  assert.deepEqual(await source.read(), [
    {
      status: 'ok',
      account: null,
      plan: 'max 20x',
      windows: [
        { kind: 'session', lengthMs: 5 * HOUR, usedPercent: 24, resetsAt: Date.parse('2027-01-10T15:00:00Z') },
        { kind: 'weekly', lengthMs: 168 * HOUR, usedPercent: 4.5, resetsAt: 1_800_000_000_000 },
      ],
      resetCredits: null,
    },
  ])
  assert.deepEqual(seen, ['https://api.anthropic.com/api/oauth/usage Bearer token-1'])
})

test('answers no account when Claude Code is not signed in, and unavailable when the login is rejected', async () => {
  const never: typeof fetch = () => Promise.reject(new Error('must not be called'))
  assert.deepEqual(await claudeUsage({ readCredentials: async () => null, fetch: never }).read(), [])
  assert.deepEqual(await claudeUsage({ readCredentials: async () => '{"claudeAiOauth":{}}', fetch: never }).read(), [])
  const [rejected] = await claudeUsage({ readCredentials: async () => credentials(), fetch: answering(401, {}) }).read()
  assert.deepEqual(rejected, {
    status: 'unavailable',
    account: null,
    reason: 'login-expired',
    detail: 'Open Claude Code to refresh this login.',
  })
})

test('files the Keychain item under the user name, or the fallback when the name has other characters', () => {
  assert.equal(claudeKeychainAccount('gui.l-1'), 'gui.l-1')
  assert.equal(claudeKeychainAccount('person@example.com'), 'claude-code-user')
})
