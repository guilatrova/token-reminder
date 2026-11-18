// Local Codex rollouts record both cumulative usage and the last model response.
// Only count responses written within the mission by a managed subscription.
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { createInterface } from 'node:readline'
import { isRecord } from './http'

async function* rollouts(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* rollouts(path)
    else if (entry.name.endsWith('.jsonl')) yield path
  }
}

export async function countMissionTokens(homes: string[], accounts: Set<string>, start: number, end: number) {
  const seen = new Set<string>()
  let total = 0
  for (const home of homes) {
    for (const folder of ['sessions', 'archived_sessions']) {
      for await (const file of rollouts(join(home, folder))) {
        const info = await stat(file).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null
          throw error
        })
        if (!info || info.mtimeMs < start) continue
        const stream = createReadStream(file, { encoding: 'utf8' })
        const lines = createInterface({ input: stream, crlfDelay: Infinity })
        let session = ''
        let since = start
        let previous: number | null = null
        try {
          for await (const line of lines) {
            if (session && !line.includes('"token_count"')) continue
            let event: unknown
            try {
              event = JSON.parse(line)
            } catch {
              continue
            }
            if (!isRecord(event) || !isRecord(event.payload)) continue
            const payload = event.payload
            if (!session) {
              if (
                event.type !== 'session_meta' ||
                typeof payload.id !== 'string' ||
                typeof payload.creator_account_id !== 'string' ||
                !accounts.has(payload.creator_account_id)
              )
                break
              session = payload.id
              if (!basename(file).endsWith(session + '.jsonl')) break
              const created = Date.parse(String(payload.timestamp))
              if (Number.isFinite(created)) since = Math.max(since, created)
              continue
            }
            if (event.type !== 'event_msg' || payload.type !== 'token_count' || !isRecord(payload.info)) continue
            const { total_token_usage: cumulative, last_token_usage: last } = payload.info
            if (!isRecord(cumulative) || !isRecord(last)) continue
            const counter = cumulative.total_tokens
            const tokens = last.total_tokens
            if (
              typeof counter !== 'number' ||
              !Number.isSafeInteger(counter) ||
              typeof tokens !== 'number' ||
              !Number.isSafeInteger(tokens) ||
              tokens < 0
            )
              continue
            if (counter === previous) continue
            previous = counter
            const time = Date.parse(String(event.timestamp))
            if (!(time >= since && time <= end)) continue
            const key = session + '/' + counter + '/' + time
            if (seen.has(key)) continue
            seen.add(key)
            total += tokens
          }
        } finally {
          lines.close()
          stream.destroy()
        }
      }
    }
  }
  return seen.size ? total : null
}
