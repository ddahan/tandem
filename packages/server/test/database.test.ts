import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/client.ts'
import { settings } from '../src/db/schema.ts'

describe('database', () => {
  it('backs up and restores from the data folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myfluence-db-'))
    const live = join(dir, 'live/myfluence.db')
    const backup = join(dir, 'data/.myfluence/myfluence.db')
    const first = await openDatabase(live)
    await first.db.insert(settings).values({ key: 'displayName', value: '"David"' })
    first.backup(backup)
    first.close()
    expect(existsSync(backup)).toBe(true)

    await rm(join(dir, 'live'), { recursive: true })
    const restored = await openDatabase(live, backup)
    expect(await restored.db.select().from(settings)).toEqual([
      { key: 'displayName', value: '"David"' },
    ])
    restored.close()
    await rm(dir, { recursive: true, force: true })
  })
})
