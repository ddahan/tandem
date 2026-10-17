// The saved settings (install.env, shared with the installer) and the per-folder databases.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { databaseFor, readSettings, settingsFile, writeSettings } from '../src/settings.ts'

const homes: string[] = []
afterEach(() => {
  while (homes.length) rmSync(homes.pop()!, { recursive: true, force: true })
})
function home() {
  const path = mkdtempSync(join(tmpdir(), 'tandem-home-'))
  homes.push(path)
  return path
}

describe('saved settings', () => {
  it("reads the installer's file and writes it back, quotes included", () => {
    const folder = home()
    writeFileSync(settingsFile(folder), "data_dir='/Users/me/My notes'\nport=3000\n")
    expect(readSettings(folder)).toEqual({ dataDir: '/Users/me/My notes', port: 3000 })
    writeSettings(folder, { dataDir: "/Users/me/Dan's notes", port: 3001 })
    expect(readFileSync(settingsFile(folder), 'utf8')).toBe(
      "data_dir='/Users/me/Dan'\\''s notes'\nport=3001\n",
    )
    expect(readSettings(folder)).toEqual({ dataDir: "/Users/me/Dan's notes", port: 3001 })
    expect(readSettings(home())).toEqual({})
  })
})

describe('databases', () => {
  it('gives each notes folder its own, and the old single one to the current folder', () => {
    const folder = home()
    writeFileSync(join(folder, 'tandem.db'), 'old')
    const current = databaseFor(folder, '/notes/a')
    expect(readFileSync(current, 'utf8')).toBe('old')
    expect(existsSync(join(folder, 'tandem.db'))).toBe(false)
    expect(databaseFor(folder, '/notes/a')).toBe(current)
    const other = databaseFor(folder, '/notes/b')
    expect(other).not.toBe(current)
    expect(existsSync(other)).toBe(false)
  })
})
