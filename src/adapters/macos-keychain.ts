// Reads one generic password from the macOS Keychain through the system's own `security` tool.
import { execFile } from 'node:child_process'

const TIMEOUT_MS = 3_000
/** `security` exits with this when no such item exists. */
const NOT_FOUND = 44

/** Resolves the secret, or null when the Keychain holds no such item. */
export function readKeychainPassword(service: string, account: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const args = ['find-generic-password', '-s', service, '-a', account, '-w']
    execFile('/usr/bin/security', args, { timeout: TIMEOUT_MS }, (error, stdout) => {
      if (!error) return resolve(stdout.trim())
      if (error.code === NOT_FOUND) return resolve(null)
      reject(new Error('The macOS Keychain did not answer.'))
    })
  })
}
