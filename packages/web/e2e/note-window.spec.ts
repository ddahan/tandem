// A note in a window of its own (Open in new window): the note alone, no sidebar, tab bar or
// side panel, kept through links and reloads, the main window's tabs left alone, and closed when
// its note goes.
import { expect, test } from '@playwright/test'
import { api, createNote, focusEnd, noteContent } from './helpers'

test('opens a note alone in its own window', async ({ page, request }) => {
  // Titles of their own: the server's notes stay from one test run to the next.
  const run = Date.now()
  const other = await createNote(request, `Window other ${run}`, 'Other.')
  const note = await createNote(request, `Window note ${run}`, `See [[Window other ${run}]].`)
  await page.goto('/')
  await page.getByTestId(`tree-Window note ${run}`).dblclick()
  // Once the main window has saved its tab (kept open by the double click).
  const savedTabs = () => page.evaluate(() => localStorage.getItem('tandem-tabs') ?? '')
  await expect
    .poll(savedTabs)
    .toContain(`"note:${note.id}","path":"/notes/${note.id}","preview":false`)
  const tabsBefore = await savedTabs()

  // From the tree's menu: a window of its own, with the note alone.
  await page.getByTestId(`tree-Window note ${run}`).click({ button: 'right' })
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('menuitem', { name: 'Open in new window' }).click(),
  ])
  await expect(popup).toHaveURL(/\/notes\/[^?]+\?window$/)
  await expect(popup.getByRole('textbox', { name: 'Title' })).toHaveValue(`Window note ${run}`)
  await expect(popup.locator('#sidebar')).toHaveCount(0)
  await expect(popup.getByTestId('tab-bar')).toHaveCount(0)
  await expect(popup.getByRole('button', { name: 'Toggle side panel' })).toHaveCount(0)
  await expect(popup.locator('[data-slot="toggle"]')).toHaveCount(0)

  // Edited there, saved as anywhere.
  await focusEnd(popup)
  await popup.keyboard.type(' Edited.')
  await expect
    .poll(() => noteContent(request, `Window note ${run}`))
    .toBe(`See [[Window other ${run}]]. Edited.\n`)

  // A link followed stays alone, and so does a reload.
  await popup.locator('.ProseMirror .wiki-link').click()
  await expect(popup).toHaveURL(new RegExp(`/notes/${other.id}\\?window$`))
  await popup.reload()
  await expect(popup.getByRole('textbox', { name: 'Title' })).toHaveValue(`Window other ${run}`)
  await expect(popup.locator('#sidebar')).toHaveCount(0)

  // The main window's tabs are as they were.
  expect(await popup.evaluate(() => localStorage.getItem('tandem-tabs') ?? '')).toBe(tabsBefore)

  // Its note gone, the window closes.
  await api(request, 'DELETE', `/nodes/${other.id}`)
  await popup.waitForEvent('close')
})
