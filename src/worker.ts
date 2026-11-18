// Composition root: the only file that reads the environment and picks the adapters.
// Adding a provider is one adapter file plus one line in `sources`.
import { readdir, readFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import type { OrcaWorkerApi } from 'orca/worker'
import { CLAUDE_CREDENTIALS_FILE, CLAUDE_KEYCHAIN_SERVICE, claudeKeychainAccount, claudeUsage } from './adapters/claude'
import { codexUsage } from './adapters/codex'
import { grokUsage } from './adapters/grok'
import { readKeychainPassword } from './adapters/macos-keychain'
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

/** The Codex accounts Orca manages. The Codex CLI's own login is left out on purpose. */
async function codexHomes(): Promise<string[]> {
  const accountsDir = join(orcaDataDir(), 'codex-accounts')
  const accountIds = await readdir(accountsDir).catch((error: unknown) => {
    if (isMissing(error)) return []
    throw error
  })
  return accountIds.map((id) => join(accountsDir, id, 'home'))
}

/** Claude Code's login: the Keychain on macOS, its config folder elsewhere and for older versions. */
async function claudeCredentials(): Promise<string | null> {
  if (process.platform === 'darwin') {
    const saved = await readKeychainPassword(CLAUDE_KEYCHAIN_SERVICE, claudeKeychainAccount(userInfo().username))
    if (saved !== null) return saved
  }
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  return readTextIfPresent(join(configDir, CLAUDE_CREDENTIALS_FILE))
}

let stop: (() => void) | undefined

export default async function activate(orca: OrcaWorkerApi): Promise<void> {
  const grokAuthFile = join(process.env.GROK_HOME ?? join(homedir(), '.grok'), 'auth.json')
  const sources = {
    Claude: claudeUsage({ readCredentials: claudeCredentials, fetch }),
    Codex: codexUsage({ homes: await codexHomes(), readFile: readTextIfPresent, fetch }),
    Grok: grokUsage({ authFile: grokAuthFile, readFile: readTextIfPresent, fetch, now: Date.now }),
  }
  stop = start(orca, sources)
}

export function deactivate(): void {
  stop?.()
}
