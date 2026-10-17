// The standalone app's options and folders (the executable itself is checked by `./td release`).
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { serveOptions } from '../src/options.ts'
import { appDir, buildVersion, runtimeFiles } from '../src/runtime.ts'

describe('serve options', () => {
  it('takes the notes folder and port from the arguments, then the environment', () => {
    expect(serveOptions(['--data', 'notes', '--port', '3100'], {})).toEqual({
      dataDir: resolve('notes'),
      port: 3100,
      asService: false,
    })
    expect(serveOptions([], { TANDEM_DATA_DIR: '/n', TANDEM_PORT: '4000' })).toMatchObject({
      dataDir: '/n',
      port: 4000,
    })
    expect(serveOptions(['--data', '/n'], {}).port).toBe(3000)
  })

  it('uses the saved folder: last by hand, first as the login item', () => {
    const saved = { dataDir: '/saved', port: 3200 }
    expect(serveOptions(['--data', '/arg'], {}, saved)).toMatchObject({ dataDir: '/arg' })
    expect(serveOptions([], {}, saved)).toMatchObject({ dataDir: '/saved', port: 3200 })
    // An older installer put the folder in the login item's arguments: Settings' choice wins.
    expect(serveOptions(['--data', '/arg'], { XPC_SERVICE_NAME: 'app.tandem' }, saved)).toEqual({
      dataDir: '/saved',
      port: 3200,
      asService: true,
    })
  })

  it('needs a notes folder and a valid port', () => {
    expect(() => serveOptions([], {})).toThrow(/notes folder/)
    expect(() => serveOptions(['--data', '/n', '--port', 'x'], {})).toThrow(/Invalid port/)
  })
})

describe('app folder', () => {
  it('follows each platform, outside the notes folder', () => {
    expect(appDir({}, 'darwin')).toBe(join(homedir(), 'Library', 'Application Support', 'Tandem'))
    expect(appDir({}, 'linux')).toBe(join(homedir(), '.local', 'share', 'tandem'))
    expect(appDir({ XDG_DATA_HOME: '/x' }, 'linux')).toBe('/x/tandem')
    expect(appDir({ TANDEM_HOME: '/t' }, 'darwin')).toBe('/t')
  })

  it("uses the repo's web app when not run as the executable", () => {
    expect(buildVersion()).toBe('dev')
    expect(runtimeFiles('/unused').webDir).toMatch(/packages\/web\/\.output\/public$/)
  })
})
