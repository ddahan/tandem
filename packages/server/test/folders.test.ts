import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { createFolder, folderProblem, listFolder } from '../src/folders.ts'
import { createTestVault } from './helpers.ts'

const temporary: string[] = []
afterEach(async () => {
  while (temporary.length) await rm(temporary.pop()!, { recursive: true, force: true })
})
async function folder() {
  const path = await mkdtemp(join(tmpdir(), 'tandem-folders-'))
  temporary.push(path)
  return path
}

describe('choosing the notes folder', () => {
  it('refuses folders that would be a bad notes folder', async () => {
    const root = await folder()
    await writeFile(join(root, 'file.md'), '')
    expect(await folderProblem('relative/path')).toMatch(/full path/)
    expect(await folderProblem('/')).toMatch(/home folder/)
    expect(await folderProblem(homedir())).toMatch(/home folder/)
    expect(await folderProblem(join(root, 'missing'))).toMatch(/doesn't exist/)
    expect(await folderProblem(join(root, 'file.md'))).toMatch(/file/)
    expect(await folderProblem(join(root, '.tandem'))).toMatch(/internal/)
    expect(await folderProblem(root, [root])).toMatch(/own folder/)
    expect(await folderProblem(root)).toBeNull()
  })

  // Root (the toolchain container) can write anywhere.
  it.skipIf(process.getuid?.() === 0)("refuses folders it can't write in", async () => {
    const root = await folder()
    await mkdir(join(root, 'locked'))
    await chmod(join(root, 'locked'), 0o500)
    expect(await folderProblem(join(root, 'locked'))).toMatch(/write/)
  })

  it('lists subfolders, and what a folder holds', async () => {
    const root = await folder()
    for (const name of ['Work', 'archive', '.hidden', '.tandem']) await mkdir(join(root, name))
    await writeFile(join(root, 'Note.md'), '')
    await writeFile(join(root, 'image.png'), '')
    const listing = await listFolder(root)
    expect(listing.folders.map((f) => f.name)).toEqual(['archive', 'Work'])
    expect(listing).toMatchObject({ path: root, tandem: true, markdownFiles: 1, problem: null })
    expect(listing.places.map((p) => p.label)).toContain('Home')
    // Hidden folders on request (Finder's ⇧⌘.), never Tandem's own.
    const all = await listFolder(root, [], { hidden: true })
    expect(all.folders.map((f) => f.name)).toEqual(['.hidden', 'archive', 'Work'])
    await expect(listFolder(join(root, 'missing'))).rejects.toThrow(/doesn't exist/)
  })

  it("shows apps' iCloud folders in iCloud Drive, as Finder does", async () => {
    const home = await folder()
    const mobile = join(home, 'Library', 'Mobile Documents')
    const make = async (container: string, file?: string) => {
      await mkdir(join(mobile, container, 'Documents'), { recursive: true })
      if (file) await writeFile(join(mobile, container, 'Documents', file), '')
    }
    await mkdir(join(mobile, 'com~apple~CloudDocs', 'Mine'), { recursive: true })
    await make('iCloud~co~noteplan~NotePlan', 'Note.md')
    await make('com~apple~Pages', 'Letter.pages')
    await make('iCloud~com~empty~App')
    await make('iCloud~com~burbn~instagram~encryptedBackups', 'data')
    await make('com~apple~mail', 'internal')
    const previous = process.env.HOME
    process.env.HOME = home
    try {
      const listing = await listFolder(join(mobile, 'com~apple~CloudDocs'))
      expect(listing.folders.map((f) => [f.name, f.app ?? false])).toEqual([
        ['Mine', false],
        ['NotePlan', true],
        ['Pages', true],
      ])
      expect(listing.folders[1]!.path).toBe(
        join(mobile, 'iCloud~co~noteplan~NotePlan', 'Documents'),
      )
    } finally {
      process.env.HOME = previous
    }
  })

  it('creates folders', async () => {
    const root = await folder()
    expect(await createFolder(root, ' Notes ')).toBe(join(root, 'Notes'))
    await expect(createFolder(root, 'Notes')).rejects.toThrow(/already exists/)
    await expect(createFolder(root, '../escape')).rejects.toThrow(/Invalid/)
    await expect(createFolder(root, '.hidden')).rejects.toThrow(/Invalid/)
  })
})

const put = (app: ReturnType<typeof createApp>, path: string) =>
  app.request('/api/notes-folder', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  })

describe('notes folder API', () => {
  it('is read-only unless whoever runs the server can switch it', async () => {
    const { vault, dataDir } = await createTestVault()
    const readOnly = createApp(vault)
    expect(await (await readOnly.request('/api/notes-folder')).json()).toMatchObject({
      path: dataDir,
      readOnlyReason: expect.stringMatching(/TANDEM_DATA_DIR/),
    })
    const target = await folder()
    expect((await put(readOnly, target)).status).toBe(400)

    const changes: string[] = []
    const switchable = createApp(vault, {
      notesFolder: { readOnlyReason: null, change: async (path) => void changes.push(path) },
    })
    expect((await put(switchable, join(target, 'missing'))).status).toBe(400)
    expect((await put(switchable, target)).status).toBe(200)
    expect(changes).toEqual([target])

    const listing = await (
      await switchable.request(`/api/disk-folders?path=${encodeURIComponent(target)}`)
    ).json()
    expect(listing).toMatchObject({ path: target, folders: [] })
  })
})
