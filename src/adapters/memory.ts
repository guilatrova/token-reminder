// A usage source that answers what it was given: for tests and for trying the panel without a login.
import type { AccountReading, UsageSource } from '../core/usage'

export function memoryUsage(accounts: AccountReading[]): UsageSource {
  return { read: async () => accounts }
}
