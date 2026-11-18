// Composition root: the only file that reads the environment and picks the adapters.
// Adding a provider is one adapter file plus one line in `sources`.
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { OrcaWorkerApi } from 'orca/worker'
import { codexUsage } from './adapters/codex'
import { start } from './app'

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readTextIfPresent(path: string): Promise<string | null> {
  return readFile(path, 'utf8').catch((error: unknown) => {
    if (isMissing(error)) return null
    throw error
  })
}

/** Where Orca keeps its own data: it signs Codex accounts in under folders of its own. */
function orcaDataDir(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'orca')
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'orca')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'orca')
}

/** Accounts Orca manages first, then the Codex CLI's own login. */
async function codexHomes(): Promise<string[]> {
  const accountsDir = join(orcaDataDir(), 'codex-accounts')
  const accountIds = await readdir(accountsDir).catch((error: unknown) => {
    if (isMissing(error)) return []
    throw error
  })
  const managed = accountIds.map((id) => join(accountsDir, id, 'home'))
  return [...managed, process.env.CODEX_HOME ?? join(homedir(), '.codex')]
}

let stop: (() => void) | undefined

export default async function activate(orca: OrcaWorkerApi): Promise<void> {
  const sources = {
    Codex: codexUsage({ homes: await codexHomes(), readFile: readTextIfPresent, fetch }),
  }
  stop = start(orca, sources)
}

export function deactivate(): void {
  stop?.()
}
