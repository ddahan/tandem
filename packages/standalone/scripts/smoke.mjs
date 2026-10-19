// Checks the built app on a Node (`./td release` runs it on the oldest supported ones, in
// Docker): starts it on a temporary folder, creates a note, searches it, loads the web app.
// Plain JavaScript: old Nodes run it as is. Usage: node smoke.mjs <built app folder>
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appDir = process.argv[2] ?? '/app'
const data = mkdtempSync(join(tmpdir(), 'tandem-smoke-notes-'))
const home = mkdtempSync(join(tmpdir(), 'tandem-smoke-home-'))
const app = spawn(
  process.execPath,
  [join(appDir, 'tandem.mjs'), 'serve', '--data', data, '--port', '3999'],
  { env: { ...process.env, TANDEM_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] },
)
let log = ''
app.stdout.on('data', (chunk) => (log += chunk))
app.stderr.on('data', (chunk) => (log += chunk))

const base = 'http://127.0.0.1:3999'
const node = `Node ${process.versions.node}`
try {
  let started = false
  for (let i = 0; i < 60 && !started; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    started = await fetch(`${base}/health`).then(
      (response) => response.ok,
      () => false,
    )
  }
  if (!started) throw new Error("the app didn't start")
  const note = await (
    await fetch(`${base}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tandem-author': 'owner' },
      body: JSON.stringify({ title: 'Smoke', content: 'hello zebra' }),
    })
  ).json()
  if (!note.id) throw new Error('no note created')
  const found = await (await fetch(`${base}/api/search?q=zebra`)).json()
  if (!JSON.stringify(found).includes(note.id)) throw new Error("search didn't find the note")
  if (!(await (await fetch(`${base}/`)).text()).includes('<html')) throw new Error('no web app')
  console.log(`${node}: OK`)
} catch (error) {
  process.exitCode = 1
  console.log(`${node}: FAIL, ${error.message}\n${log.trim().split('\n').slice(-4).join('\n')}`)
} finally {
  app.kill()
}
