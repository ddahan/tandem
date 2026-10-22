import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { openDatabase, type Database } from '../src/db/client.ts'
import { Vault, type VaultOptions } from '../src/vault/vault.ts'

export interface TestVault {
  vault: Vault
  database: Database
  dataDir: string
  clock: { now: number; advance(ms: number): void }
}

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

/**
 * A vault on a temporary data folder and an in-memory database, with a manual clock. It reads
 * no web page, unless given a `fetch`.
 */
export async function createTestVault(
  options: Pick<VaultOptions, 'fetch'> = {},
): Promise<TestVault> {
  const dataDir = await mkdtemp(join(tmpdir(), 'tandem-test-'))
  const database = await openDatabase(':memory:')
  const clock = {
    now: new Date('2026-10-17T10:00:00Z').getTime(),
    advance(ms: number) {
      this.now += ms
    },
  }
  const vault = new Vault({
    dataDir,
    database,
    now: () => clock.now,
    sessionIdleMs: 30_000,
    fetch: options.fetch,
  })
  cleanups.push(async () => {
    database.close()
    await rm(dataDir, { recursive: true, force: true })
  })
  return { vault, database, dataDir, clock }
}
