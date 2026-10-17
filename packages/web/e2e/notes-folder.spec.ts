// Settings › Notes folder: read-only where Tandem's start sets it (these tests, Docker), and
// the folder picker, with the switch itself simulated (the standalone app restarts for real).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { api } from './helpers'

test('shows the notes folder, read-only when the start sets it', async ({ page, request }) => {
  const { path } = await api<{ path: string }>(request, 'GET', '/notes-folder')
  await page.goto('/settings')
  const section = page.getByTestId('notes-folder')
  await expect(section).toContainText(path)
  await expect(section.getByRole('button', { name: 'Change…' })).toHaveCount(0)
  await expect(page.getByText(/TANDEM_DATA_DIR/)).toBeVisible()
})

test('picks another folder: browses, creates one, and switches', async ({ page, request }) => {
  const { path: current } = await api<{ path: string }>(request, 'GET', '/notes-folder')
  // Neighbours of the current notes folder: one with Tandem notes, one with Markdown files.
  const base = dirname(current)
  mkdirSync(join(base, 'Picker notes', '.tandem'), { recursive: true })
  mkdirSync(join(base, 'Picker drafts'), { recursive: true })
  writeFileSync(join(base, 'Picker drafts', 'Idea.md'), '# Idea\n')

  // The switch is simulated: the server accepts, then answers on the new folder.
  let folder = current
  let switched: string | null = null
  await page.route('**/api/notes-folder', async (route) => {
    if (route.request().method() === 'PUT') {
      switched = (route.request().postDataJSON() as { path: string }).path
      folder = switched
      return route.fulfill({ json: { path: switched } })
    }
    return route.fulfill({ json: { path: folder, readOnlyReason: null } })
  })

  await page.goto('/settings')
  await page.getByTestId('notes-folder').getByRole('button', { name: 'Change…' }).click()
  const picker = page.getByTestId('notes-folder-picker')
  const summary = page.getByTestId('notes-folder-summary')
  const use = page.getByRole('button', { name: 'Use this folder' })

  await picker.getByRole('button', { name: 'Picker drafts' }).click()
  await expect(summary).toContainText('1 Markdown file here')
  await picker.getByRole('button', { name: '..' }).click()
  await picker.getByRole('button', { name: 'Picker notes' }).click()
  await expect(summary).toContainText('Holds Tandem notes')

  // A new, empty folder.
  await picker.getByRole('button', { name: 'New folder' }).click()
  await picker.getByLabel('New folder name').fill('Fresh notes')
  await picker.getByRole('button', { name: 'Create' }).click()
  await expect(summary).toContainText('An empty start')
  await expect(use).toBeEnabled()

  // Not the home folder, nor the current one.
  await picker.getByLabel('Folder path').fill(current)
  await picker.getByLabel('Folder path').press('Enter')
  await expect(summary).toContainText('current notes folder')
  await expect(use).toBeDisabled()

  await picker.getByLabel('Folder path').fill(join(base, 'Picker notes'))
  await picker.getByLabel('Folder path').press('Enter')
  await use.click()
  await expect(page).toHaveURL(/\/$/)
  expect(switched).toBe(join(base, 'Picker notes'))
})
