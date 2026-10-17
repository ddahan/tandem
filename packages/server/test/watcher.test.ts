import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { watchVault } from '../src/watcher.ts'
import { createTestVault } from './helpers.ts'

describe('watcher', () => {
  it('reconciles files written by other programs', async () => {
    const { vault, dataDir } = await createTestVault()
    const watcher = watchVault(vault, { debounceMs: 50 })
    await new Promise<void>((resolve) => watcher.once('ready', () => resolve()))
    const changed = new Promise((resolve) => vault.events.once('event', resolve))
    await writeFile(join(dataDir, 'Agent.md'), '# From an agent\n')
    expect(await changed).toEqual({ type: 'tree' })
    expect((await vault.tree()).map((n) => n.title)).toEqual(['Agent'])
    await watcher.close()
  })
})
