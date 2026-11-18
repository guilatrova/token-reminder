import { assert, test } from 'orca/testing'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { countMissionTokens } from '../src/adapters/codex-mission-tokens'

test('counts only new local usage in the mission window, once across duplicate rollouts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mission-tokens-'))
  const log = (id: string, owner: string) => {
    const lines = [
      {
        type: 'session_meta',
        payload: { id, creator_account_id: owner, timestamp: new Date(1).toISOString() },
      } as object,
    ]
    for (const [ms, cumulative, last] of [
      [100, 20, 20],
      [200, 20, 20],
      [201, 45, 25],
      [202, 45, 25],
      [301, 80, 35],
    ] as const) {
      lines.push({
        type: 'event_msg',
        timestamp: new Date(ms).toISOString(),
        payload: {
          type: 'token_count',
          info: { total_token_usage: { total_tokens: cumulative }, last_token_usage: { total_tokens: last } },
        },
      })
    }
    return lines.map((line) => JSON.stringify(line)).join('\n')
  }
  try {
    for (const dir of ['sessions', 'archived_sessions']) {
      await mkdir(join(home, dir))
      await writeFile(join(home, dir, 'rollout-mine.jsonl'), log('mine', 'a'))
    }
    await writeFile(join(home, 'sessions', 'rollout-other.jsonl'), log('other', 'b'))
    assert.equal(await countMissionTokens([home], new Set(['a']), 200, 300), 25)
    assert.equal(await countMissionTokens([home], new Set(['missing']), 200, 300), null)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
