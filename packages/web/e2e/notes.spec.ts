// The main flows of the app, in a real browser against the real server.
import { expect, test, type Page } from '@playwright/test'
import {
  api,
  chooseTheme,
  createNote,
  focusEnd,
  noteContent,
  openNote,
  resolve,
  waitSaved,
} from './helpers'

test('creates a page, edits it with Markdown shortcuts, and saves it in the background', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New page', exact: true }).first().click()
  await expect(page).toHaveURL(/\/notes\//)

  const title = page.getByLabel('Title', { exact: true })
  await title.fill('First page')
  await title.press('Enter')
  await expect(page.locator('.ProseMirror')).toBeFocused()
  await page.keyboard.type('## Plan')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Some **bold** text')
  await page.keyboard.press('Enter')
  await page.keyboard.type('[ ] a task')

  await waitSaved(page)
  await expect(page.getByTestId('tree-First page')).toBeVisible()
  await expect
    .poll(() => noteContent(request, 'First page'))
    .toBe('## Plan\n\nSome **bold** text\n\n- [ ] a task\n')
})

test('links notes with [[ and follows the link', async ({ page, request }) => {
  const target = await createNote(request, 'Link target', 'The target.')
  const source = await createNote(request, 'Link source', 'Start.')
  await openNote(page, source.id)
  await focusEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('See [[Link ta')
  // The `[[` menu lists matching notes; Enter picks the first one.
  await expect(page.getByRole('option', { name: /Link target/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await waitSaved(page)
  await expect.poll(() => noteContent(request, 'Link source')).toContain('See [[Link target]]')

  // In-app navigation: the page is not reloaded (the marker survives).
  await page.evaluate(() => ((window as Window & { marker?: string }).marker = 'still here'))
  await page.locator('.ProseMirror .wiki-link').click()
  await expect(page).toHaveURL(new RegExp(`/notes/${target.id}`))
  expect(await page.evaluate(() => (window as Window & { marker?: string }).marker)).toBe(
    'still here',
  )
  expect(page.context().pages()).toHaveLength(1)
  // The backlink is listed in the side panel.
  await page.getByRole('tab', { name: 'Links' }).click()
  await expect(page.getByRole('link', { name: /Link source/ })).toBeVisible()
})

test('searches from the palette, forgiving typos', async ({ page, request }) => {
  const note = await createNote(
    request,
    'Quarterly budget',
    'Numbers for the marketing department.',
  )
  await page.goto('/')
  await page
    .getByRole('button', { name: /Search/ })
    .first()
    .click()
  await page.getByPlaceholder(/Search notes/).fill('markting')
  await expect(page.getByText('Showing results for “marketing”')).toBeVisible()
  await page.getByRole('option', { name: /Quarterly budget/ }).click()
  await expect(page).toHaveURL(new RegExp(`/notes/${note.id}`))
})

test('opens the search palette filtered on a tag, with syntax tips', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { tags: true })
  const note = await createNote(request, 'Tagged note', 'Some text.')
  await api(request, 'PUT', `/notes/${note.id}/tags`, { tags: ['palette-tag'] })
  await page.goto('/')
  await page.getByRole('button', { name: /palette-tag/ }).click()
  const input = page.getByPlaceholder(/Search notes/)
  await expect(input).toHaveValue('tag:palette-tag ')
  await expect(page.getByRole('option', { name: /Tagged note/ })).toBeVisible()

  // An empty query shows the syntax; picking a tip puts it in the field.
  await input.fill('')
  await page.getByRole('option', { name: /in:Projects/ }).click()
  await expect(input).toHaveValue('in:Projects ')
  await api(request, 'PATCH', '/settings', { tags: false })
})

test('renames a note from its title, keeping links working', async ({ page, request }) => {
  const note = await createNote(request, 'Old title', 'Content')
  await createNote(request, 'Linker', 'Points to [[Old title]].')
  await openNote(page, note.id)
  const title = page.getByLabel('Title', { exact: true })
  await title.fill('New title')
  await title.press('Tab')
  await expect(page.getByTestId('tree-New title')).toBeVisible()
  expect((await resolve(request, 'New title')).id).toBe(note.id)
  await expect.poll(() => noteContent(request, 'Linker')).toBe('Points to [[New title]].')
})

test('moves a page by dragging it onto another one in the tree', async ({ page, request }) => {
  await createNote(request, 'Drag parent')
  const child = await createNote(request, 'Drag child')
  await page.goto('/')
  await page.getByTestId('tree-Drag child').dragTo(page.getByTestId('tree-Drag parent'))
  await expect
    .poll(async () => (await resolve(request, child.id)).path)
    .toBe('Drag parent/Drag child.md')
})

test('shows changes made by an agent live, with authorship', async ({ page, request }) => {
  const note = await createNote(request, 'Live note', 'Written by me.')
  await openNote(page, note.id)
  await api(request, 'POST', `/notes/${note.id}/append`, { content: 'Added by Claude.' }, 'claude')
  await expect(page.locator('.ProseMirror')).toContainText('Added by Claude.')
  await expect(page.getByText('Updated by Claude').first()).toBeVisible()

  await page.getByRole('button', { name: 'Authorship' }).click()
  await expect(page.getByTestId('authorship-block')).toHaveCount(2)
  await expect(page.getByText('Written by', { exact: true })).toBeVisible()
  await expect(page.getByText('Claude', { exact: true })).toBeVisible()
})

test('detects a conflict with an agent and keeps my version', async ({ page, request }) => {
  const note = await createNote(request, 'Conflict note', 'Original.')
  await openNote(page, note.id)
  await focusEnd(page)
  await page.keyboard.type(' Mine.')
  // The agent saves before the editor's background save.
  await api(request, 'PUT', `/notes/${note.id}/content`, { content: 'Theirs.' }, 'claude')
  await expect(
    page.getByText('This note was changed elsewhere while you were editing'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Keep mine' }).click()
  await expect.poll(() => noteContent(request, note.id)).toBe('Original. Mine.\n')
})

test('keeps history and restores a version', async ({ page, request }) => {
  const note = await createNote(request, 'History note', 'First version.')
  // A version is kept once the session is idle (1.5 s in these tests).
  await expect
    .poll(async () => (await api<unknown[]>(request, 'GET', `/notes/${note.id}/history`)).length, {
      timeout: 10_000,
    })
    .toBe(1)
  await api(request, 'PUT', `/notes/${note.id}/content`, { content: 'Second version.' }, 'claude')
  await openNote(page, note.id)
  await page.getByRole('tab', { name: 'History', exact: true }).click()
  await page.getByTestId('history-version').first().click()
  await page.getByRole('button', { name: 'Restore this version' }).click()
  await expect(page.locator('.ProseMirror')).toContainText('First version.')
  await expect.poll(() => noteContent(request, note.id)).toBe('First version.')
})

test('attaches files from the side panel', async ({ page, request }) => {
  const note = await createNote(request, 'Attachments note', 'Files below.')
  await openNote(page, note.id)
  await page.getByRole('tab', { name: 'Files' }).click()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  // The panel's empty state says how; "click here" opens the file picker.
  const panel = page.locator('#tandem-panels-panel-note-side')
  await expect(panel).toContainText('Upload a file by dragging it on the note, or click here.')
  const chooser = page.waitForEvent('filechooser')
  await panel.getByRole('button', { name: 'click here' }).click()
  await (await chooser).setFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png })
  const image = page.locator('.ProseMirror img')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await expect
    .poll(() => noteContent(request, note.id))
    .toContain('![pixel.png](Attachments%20note.assets/pixel.png)')
})

test('shows an image of the Files panel in a modal, other files in a new tab', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Gallery note', 'Files below.')
  // Larger than the window: the modal scales it down.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000"><rect width="4000" height="3000" fill="teal"/></svg>'
  for (const file of [
    { name: 'wide.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Some text.') },
  ]) {
    const response = await request.post(`/api/notes/${note.id}/attachments`, {
      multipart: { file },
    })
    expect(response.ok()).toBe(true)
  }
  await openNote(page, note.id)
  await page.getByRole('tab', { name: 'Files' }).click()
  const image = page
    .locator('#tandem-panels-panel-note-side')
    .getByRole('link', { name: 'wide.svg' })
  const dialog = page.getByRole('dialog')
  const preview = dialog.getByTestId('image-preview')

  await image.click()
  await expect(dialog).toContainText('wide.svg')
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(4000)
  expect(page.context().pages()).toHaveLength(1)
  // Inside the modal, itself smaller than the window (not full screen).
  const viewport = page.viewportSize()!
  const frame = (await dialog.boundingBox())!
  const shown = (await preview.boundingBox())!
  expect(frame.width).toBeLessThan(viewport.width)
  expect(frame.height).toBeLessThan(viewport.height)
  expect(shown.x).toBeGreaterThanOrEqual(frame.x)
  expect(shown.y).toBeGreaterThanOrEqual(frame.y)
  expect(shown.x + shown.width).toBeLessThanOrEqual(frame.x + frame.width)
  expect(shown.y + shown.height).toBeLessThanOrEqual(frame.y + frame.height)
  expect(shown.width / shown.height).toBeCloseTo(4 / 3, 1)

  // Closed with Esc, its close button, or a click outside.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await image.click()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await image.click()
  await expect(dialog).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(dialog).toBeHidden()

  // Other files open in a new tab, as before.
  const [opened] = await Promise.all([
    page.context().waitForEvent('page'),
    page.locator('#tandem-panels-panel-note-side').getByRole('link', { name: 'notes.txt' }).click(),
  ])
  await expect(opened).toHaveURL(/\/files\/Gallery%20note\.assets\/notes\.txt$/)
  await opened.close()
})

test('moves to the trash, restores, and empties the trash', async ({ page, request }) => {
  const note = await createNote(request, 'Trash me', 'Bye.')
  await openNote(page, note.id)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Move to trash' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/trash')
  await expect(page.getByTestId('trash-item').filter({ hasText: 'Trash me' })).toBeVisible()
  await page
    .getByTestId('trash-item')
    .filter({ hasText: 'Trash me' })
    .getByRole('button', { name: 'Restore' })
    .click()
  await expect(page.getByTestId('tree-Trash me')).toBeVisible()

  await api(request, 'DELETE', `/nodes/${note.id}`)
  await page.reload()
  await page.getByRole('button', { name: 'Empty trash' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empty trash' }).click()
  await expect(page.getByText('The trash is empty')).toBeVisible()
})

test('edits the Markdown source directly', async ({ page, request }) => {
  const note = await createNote(request, 'Source note', '# Title\n')
  await openNote(page, note.id)
  await page.getByRole('button', { name: 'Markdown source' }).click()
  const source = page.getByRole('textbox', { name: 'Markdown source' })
  await expect(source).toHaveValue('# Title\n')
  await source.fill('# Title\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n')
  await waitSaved(page)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.locator('.ProseMirror table')).toBeVisible()
})

test('keeps Markdown the editor would lose: read-only, then edit anyway', async ({
  page,
  request,
}) => {
  // As an agent would write it: a comment the editor can't show.
  const markdown = 'Intro\n\n<!-- for agents: keep this -->\n\nBody\n'
  const note = await createNote(request, 'Lossy note', markdown)
  await openNote(page, note.id)
  const banner = page.getByTestId('markdown-loss')
  await expect(banner).toContainText('line 3 (an HTML comment)')
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
  // Its line number leads to the line, in the Markdown view.
  await banner.getByRole('button', { name: 'line 3' }).click()
  const source = page.getByRole('textbox', { name: 'Markdown source' })
  await expect(source).toBeFocused()
  expect(
    await source.evaluate((t: HTMLTextAreaElement) =>
      t.value.slice(t.selectionStart, t.selectionEnd),
    ),
  ).toBe('<!-- for agents: keep this -->')
  // The editor stays closed, unless asked.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(source).toBeVisible()
  await banner.getByRole('button', { name: 'Open the editor anyway' }).click()
  await expect(banner).toHaveCount(0)
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
  // Nothing saved until an edit.
  expect(await noteContent(request, note.id)).toBe(markdown)
})

test('won’t switch to the editor while it would lose Markdown, unless asked', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Lossy source', '# Title\n')
  await openNote(page, note.id)
  await page.getByRole('button', { name: 'Markdown source' }).click()
  const source = page.getByRole('textbox', { name: 'Markdown source' })
  await source.fill('# Title\n\nPress <kbd>Ctrl</kbd>\n')
  const message = page.getByTestId('markdown-loss')
  await expect(message).toContainText('line 3 (HTML <kbd>)')
  // Numbered lines, the lost one in red.
  const number = (line: number) => page.locator(`[data-source-line="${line}"]`)
  await expect(number(3)).toHaveText('3')
  await expect(number(3)).toHaveClass(/text-error/)
  await expect(number(1)).not.toHaveClass(/text-error/)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(source).toBeVisible()
  // Fixed: the editor opens.
  await source.fill('# Title\n\nPress `Ctrl`\n')
  await expect(message).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.locator('.ProseMirror code')).toHaveText('Ctrl')
  // Or opened anyway.
  await page.getByRole('button', { name: 'Markdown source' }).click()
  await source.fill('# Title\n\n<span>x</span>\n')
  await message.getByRole('button', { name: 'Open the editor anyway' }).click()
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
  await waitSaved(page)
})

test('changes the theme and the settings', async ({ page, request }) => {
  await page.goto('/settings')
  // The version, from the standalone package (the app's): at the bottom of the sidebar.
  await expect(page.getByTestId('app-version')).toHaveText(/^v\d+\.\d+\.\d+$/)
  await page.getByRole('button', { name: 'emerald' }).click()
  await expect
    .poll(
      async () => (await api<{ primaryColor: string }>(request, 'GET', '/settings')).primaryColor,
    )
    .toBe('emerald')
  await chooseTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)

  // The workspace name: next to the logo and in the tab.
  await page.getByLabel('Workspace name').fill('Brain')
  await page.getByLabel('Workspace name').press('Enter')
  await expect(page.getByTestId('workspace-name')).toHaveText('Brain')
  await expect(page).toHaveTitle('Settings · Brain')
  await api(request, 'PATCH', '/settings', { workspaceName: 'Tandem' })
})

test('colors the title bar like the background (theme-color)', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { backgroundTone: 'paper' })
  const themeColor = page.locator('meta[name="theme-color"]')
  await page.goto('/')
  await expect(page.getByTestId('workspace-name')).toBeVisible()
  await expect(themeColor).toHaveCount(1)
  await expect(themeColor).toHaveAttribute('content', '#fbf8f1')

  await chooseTheme(page, 'Dark')
  await expect(themeColor).toHaveAttribute('content', '#1e1c19')
  // Remembered: the next launch starts with it.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(themeColor).toHaveAttribute('content', '#1e1c19')

  await chooseTheme(page, 'Light')
  await api(request, 'PATCH', '/settings', { backgroundTone: 'white' })
})

test('switches the color mode in Settings, not from the sidebar', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Theme: / })).toHaveCount(0)
  await page.goto('/settings')
  const card = (mode: string) => page.getByRole('button', { name: `Theme: ${mode}` })
  await expect(card('System')).toHaveAttribute('aria-pressed', 'true')
  await chooseTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(card('Dark')).toHaveAttribute('aria-pressed', 'true')
  await expect(card('System')).toHaveAttribute('aria-pressed', 'false')
  await chooseTheme(page, 'Light')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('shows the chosen theme at once on reload, before the settings load', async ({
  page,
  request,
}) => {
  await api(request, 'PATCH', '/settings', { primaryColor: 'emerald', backgroundTone: 'paper' })
  const theme = () =>
    page.evaluate(() => ({
      primary: getComputedStyle(document.documentElement).getPropertyValue('--ui-primary'),
      tone: document.documentElement.dataset.tone,
    }))
  await page.goto('/')
  await expect(page.getByTestId('workspace-name')).toBeVisible()
  const chosen = await theme()
  expect(chosen.tone).toBe('paper')

  // The server's settings come late: the remembered ones are already applied.
  await page.route('**/api/settings', async (route) => {
    await new Promise((done) => setTimeout(done, 3000))
    await route.continue()
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  expect(await theme()).toEqual(chosen)

  await page.unroute('**/api/settings')
  await api(request, 'PATCH', '/settings', { primaryColor: 'amber', backgroundTone: 'white' })
})

/** Drops files on the editor, as dragging them from Finder would. */
async function dropFiles(
  page: Page,
  files: { name: string; type: string; size?: number; text?: string }[],
) {
  await page.locator('.ProseMirror').evaluate((editor, list) => {
    const transfer = new DataTransfer()
    for (const file of list) {
      const data = file.size ? new Uint8Array(file.size) : (file.text ?? '')
      transfer.items.add(new File([data], file.name, { type: file.type }))
    }
    const rect = editor.getBoundingClientRect()
    editor.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: rect.x + 5,
        clientY: rect.y + 5,
      }),
    )
  }, files)
}

test('drops a file into a note, shown as a file chip', async ({ page, request }) => {
  const note = await createNote(request, 'Drop note', 'Before.')
  await openNote(page, note.id)
  await dropFiles(page, [{ name: 'report.pdf', type: 'application/pdf', text: 'PDF' }])
  await expect(page.locator('.ProseMirror .file-chip')).toHaveText('report.pdf')
  // With the PDF icon (bundled SVG), and in the Files panel too.
  const chipIcon = await page
    .locator('.ProseMirror .file-chip')
    .evaluate((chip) => getComputedStyle(chip, '::before').backgroundImage)
  expect(chipIcon).toContain('data:image/svg+xml')
  // A button: pointer cursor, no link underline, and a click opens the file in a new tab.
  const chip = page.locator('.ProseMirror .file-chip')
  await chip.hover()
  expect(await chip.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer')
  // The pill's outline, not a link underline: its bottom edge looks like the others.
  const edges = await chip.evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.borderBottomColor, style.borderTopColor, style.textDecorationLine]
  })
  expect(edges[0]).toBe(edges[1])
  expect(edges[2]).toBe('none')
  const [opened, fileRequest] = await Promise.all([
    page.context().waitForEvent('page'),
    page
      .context()
      .waitForEvent('request', (r) => r.url().endsWith('/files/Drop%20note.assets/report.pdf')),
    chip.click(),
  ])
  expect(fileRequest.frame().page()).toBe(opened)
  await opened.close()
  await page.getByRole('tab', { name: 'Files' }).click()
  await expect(page.getByTestId('file-icon').locator('svg')).toHaveCount(1)
  // Hovering the file doesn't move its name, nor underline it (as the chips).
  const name = page
    .locator('#tandem-panels-panel-note-side')
    .getByRole('link', { name: 'report.pdf' })
  const before = await name.boundingBox()
  await name.hover()
  expect(await name.boundingBox()).toEqual(before)
  expect(await name.evaluate((link) => getComputedStyle(link).textDecorationLine)).toBe('none')
  await expect
    .poll(() => noteContent(request, note.id))
    .toContain('[report.pdf](Drop%20note.assets/report.pdf)')
})

test('asks before attaching a file over 10 MB', async ({ page, request }) => {
  const note = await createNote(request, 'Large drop', 'Before.')
  await openNote(page, note.id)
  await dropFiles(page, [{ name: 'video.mp4', type: 'video/mp4', size: 11 * 1024 * 1024 }])
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('over 10 MB')
  await dialog.getByRole('button', { name: 'Attach anyway' }).click()
  await expect
    .poll(() => noteContent(request, note.id))
    .toContain('[video.mp4](Large%20drop.assets/video.mp4)')
})

test('changes the text size of notes only', async ({ page, request }) => {
  const note = await createNote(request, 'Text size note', '# Heading\n\nBody text.')
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Text size: Extra large' }).click()
  await expect
    .poll(
      async () =>
        (await api<{ editorFontSize: string }>(request, 'GET', '/settings')).editorFontSize,
    )
    .toBe('xlarge')
  await openNote(page, note.id)
  const fontSize = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize)
  expect(await fontSize('.ProseMirror p')).toBe('20px')
  expect(await fontSize('.ProseMirror h1')).toBe('37.5px')
  // The interface keeps its size.
  expect(await fontSize('[data-testid="tree-Text size note"]')).toBe('14px')
  await api(request, 'PATCH', '/settings', { editorFontSize: 'medium' })
})

test('tints the background, in light and dark mode', async ({ page, request }) => {
  await page.goto('/settings')
  await chooseTheme(page, 'Light')
  await page.getByRole('button', { name: 'Background: Paper' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-tone', 'paper')
  const background = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim(),
    )
  await expect.poll(background).toBe('#fbf8f1')
  await chooseTheme(page, 'Dark')
  await expect.poll(background).toBe('#1e1c19')
  expect((await api<{ backgroundTone: string }>(request, 'GET', '/settings')).backgroundTone).toBe(
    'paper',
  )
  await api(request, 'PATCH', '/settings', { backgroundTone: 'white' })
})

test('draws the logo and the tab icon in the accent color', async ({ page, request }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'emerald' }).click()
  const logoColor = () =>
    page
      .getByTestId('app-logo')
      // The first line of the front page: shade 500 of the accent color.
      .locator('rect[style]')
      .first()
      .evaluate((rect) => getComputedStyle(rect).fill)
  // The computed color of emerald 500, written the way browsers write computed colors.
  const emerald = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-emerald-500)'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  await expect.poll(logoColor).toBe(emerald)
  await expect
    .poll(() =>
      page
        .locator('link[rel="icon"]')
        .evaluateAll((links) => links.map((l) => l.getAttribute('href'))),
    )
    .toEqual([expect.stringMatching(/^data:image\/svg\+xml/)])
  await api(request, 'PATCH', '/settings', { primaryColor: 'amber' })
})

test('makes any kind of list at any level, typed or from the slash menu', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Mixed lists', '')
  await openNote(page, note.id)
  await focusEnd(page)
  const steps = [
    // Enter on an empty item outdents it, then leaves the list.
    ['- Groceries', 'Enter', 'Tab', '[] Milk', 'Enter', 'Bread', 'Enter', 'Enter', 'Enter'],
    ['[ ] Errands', 'Enter', 'Tab', 'Bank', 'Enter', '/bullet'],
  ].flat()
  for (const step of steps) {
    if (step === 'Enter' || step === 'Tab') await page.keyboard.press(step)
    else await page.keyboard.type(step)
  }
  await expect(page.getByText('Bullet list', { exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Post')
  await waitSaved(page)
  // Each level has one kind; the slash menu changes the level, keeping its text.
  await expect
    .poll(async () => (await noteContent(request, note.id)).trim())
    .toBe(
      [
        '- Groceries',
        '  - [ ] Milk',
        '  - [ ] Bread',
        '',
        '- [ ] Errands',
        '  - Bank',
        '  - Post',
      ].join('\n'),
    )
})

test('draws numbers nested in a to-do like any numbers', async ({ page, request }) => {
  const note = await createNote(request, 'Nested numbers', '- [ ] Task\n  1. nested\n\n1. top\n')
  await openNote(page, note.id)
  // Nuxt UI gives every marker inside a bullet (or to-do) list the bullets' faint color.
  const color = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((li) => getComputedStyle(li, '::marker').color)
  expect(await color('.ProseMirror ul[data-type=taskList] ol > li')).toBe(
    await color('.ProseMirror > ol > li'),
  )
})

test('reloads once, after saving, when the server has a newer build of the app', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Updated app', 'Before')
  await openNote(page, note.id)
  // Tandem reinstalled while the window was open: another build on the server.
  await page.route('**/_app/builds/latest.json', (route) =>
    route.fulfill({ json: { id: 'newer', timestamp: 0 } }),
  )
  const loads: string[] = []
  page.on('load', () => loads.push(page.url()))
  const prompts: string[] = []
  page.on('dialog', (dialog) => {
    prompts.push(dialog.type())
    void dialog.accept()
  })
  await focusEnd(page)
  await page.keyboard.type(' and after')
  // The window comes back into view while the typing still waits to be saved: saved first (a
  // reload with unsaved changes would ask to leave), then reloaded.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => loads.length).toBe(1)
  expect(prompts).toEqual([])
  expect((await noteContent(request, note.id)).trim()).toBe('Before and after')
  await expect(page.locator('.ProseMirror')).toContainText('Before and after')
  // Once: the new build is the one shown now (here the server keeps answering "newer").
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(1500)
  expect(loads).toHaveLength(1)
})

test('strikes a done to-do, not its sub-items', async ({ page, request }) => {
  const note = await createNote(request, 'Done parent', '- [x] Parent\n  - [ ] Child\n')
  await openNote(page, note.id)
  // A strike-through set on an element reaches all its content: it is set on the item's own
  // lines only, never on the block that also holds its sub-items.
  const strike = (selector: string) =>
    page.locator(selector).evaluate((element) => getComputedStyle(element).textDecorationLine)
  const parent = '.ProseMirror > ul > li[data-checked=true] > div'
  expect(await strike(`${parent} > p`)).toBe('line-through')
  expect(await strike(parent)).toBe('none')
  expect(await strike(`${parent} > ul > li[data-checked=false] > div`)).toBe('none')
})

test('moves list items level by level, whatever their kinds, and saves what it shows', async ({
  page,
  request,
}) => {
  const keys = async (...steps: string[]) => {
    for (const step of steps) {
      if (/^(Enter|Tab|Shift\+Tab|Backspace)$/.test(step)) await page.keyboard.press(step)
      else await page.keyboard.type(step)
    }
  }
  const newNote = async (title: string) => {
    const note = await createNote(request, title, '')
    await openNote(page, note.id)
    await focusEnd(page)
    return note
  }

  // A numbered list in a to-do in a numbered list; Backspace on an empty item steps out one
  // level at a time (no going back and forth), then joins the line above.
  const nested = await newNote('List keys')
  await keys('1. dq', 'Enter', 'Tab', '[ ] Hello', 'Enter', 'Tab', '1. TADA', 'Enter')
  await keys('Backspace', 'Backspace', 'Backspace', 'Backspace', 'Backspace')
  await waitSaved(page)
  expect(await noteContent(request, nested.id)).toBe('1. dq\n   - [ ] Hello\n     1. TAD\n')
  // Read back the same: TAD stays under Hello.
  await openNote(page, nested.id)
  await expect(page.locator('.ProseMirror ul[data-type=taskList] ol li')).toHaveText('TAD')

  // Shift+Tab on a bullet under a to-do moves the bullet, not the to-do.
  const outdent = await newNote('List outdent')
  await keys('[ ] Parent', 'Enter', 'Tab', '- Child', 'Shift+Tab')
  await waitSaved(page)
  expect(await noteContent(request, outdent.id)).toBe('- [ ] Parent\n- [ ] Child\n')

  // Tab on a first item keeps the focus in the note.
  const first = await newNote('List first item')
  await keys('- a', 'Tab', 'b')
  await waitSaved(page)
  expect(await noteContent(request, first.id)).toBe('- ab\n')
})

test('aligns task checkboxes with their text, at any text size', async ({ page, request }) => {
  const note = await createNote(request, 'Tasks note', '- [x] Done task\n- [ ] Open task\n')
  // Distance between the centers of each checkbox and of its first line of text.
  const offsets = () =>
    page.locator('.ProseMirror li[data-checked]').evaluateAll((items) =>
      items.map((item) => {
        const box = item.querySelector('input')!.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(item.querySelector('p')!)
        const line = range.getClientRects()[0]!
        return Math.abs(box.top + box.height / 2 - (line.top + line.height / 2))
      }),
    )
  for (const size of ['medium', 'xlarge']) {
    await api(request, 'PATCH', '/settings', { editorFontSize: size })
    await openNote(page, note.id)
    for (const offset of await offsets()) expect(offset).toBeLessThan(1.5)
  }
  await api(request, 'PATCH', '/settings', { editorFontSize: 'medium' })
})

test('moves one list item with the block handle, reached with the mouse', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Handle note', 'Intro.\n\n- [ ] Hey\n- [ ] TODO\n\nEnd.\n')
  await openNote(page, note.id)
  const item = page.locator('.ProseMirror li', { hasText: 'Hey' })
  const box = (await item.boundingBox())!
  const y = box.y + box.height / 2
  // From the text to the handle, left of the block, as a hand would: the handle stays.
  await page.mouse.move(box.x + 80, y)
  await page.mouse.move(box.x - 16, y, { steps: 12 })
  const handle = page.locator('button[data-slot="handle"]')
  await expect(handle).toBeVisible()

  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 4 })
  const target = (await page.locator('.ProseMirror li', { hasText: 'TODO' }).boundingBox())!
  await page.mouse.down()
  // Over the end of the line: the editor drops after the item (before it, near the start).
  await page.mouse.move(target.x + target.width - 20, target.y + target.height / 2, { steps: 16 })
  await page.mouse.up()
  await expect
    .poll(() => noteContent(request, note.id))
    .toBe('Intro.\n\n- [ ] TODO\n- [ ] Hey\n\nEnd.\n')
})

test('shows links to missing notes differently, until the note exists', async ({
  page,
  request,
}) => {
  await createNote(request, 'Link target')
  const note = await createNote(
    request,
    'Links note',
    'See [[Link target]] and [[Not written yet]].\n',
  )
  await openNote(page, note.id)
  const existing = page.locator('.ProseMirror .wiki-link', { hasText: 'Link target' })
  const missing = page.locator('.ProseMirror .wiki-link', { hasText: 'Not written yet' })
  await expect(existing).not.toHaveClass(/wiki-link--missing/)
  await expect(existing).toHaveCSS('cursor', 'pointer')
  await expect(missing).toHaveClass(/wiki-link--missing/)
  await expect(missing).toHaveCSS('cursor', 'copy')

  // Clicking offers to create it; once created, it's a normal link.
  await missing.click()
  await page.getByRole('button', { name: 'Create it' }).click()
  await expect(page).not.toHaveURL(new RegExp(note.id))
  await openNote(page, note.id)
  await expect(missing).toBeVisible()
  await expect(missing).not.toHaveClass(/wiki-link--missing/)

  // Live: an agent creates a missing note while this one is open.
  await api(
    request,
    'PUT',
    `/notes/${note.id}/content`,
    { content: 'See [[Link target]] and [[Not written yet]] and [[By an agent]].\n' },
    'claude',
  )
  const byAgent = page.locator('.ProseMirror .wiki-link', { hasText: 'By an agent' })
  await expect(byAgent).toHaveClass(/wiki-link--missing/)
  await createNote(request, 'By an agent')
  await expect(byAgent).not.toHaveClass(/wiki-link--missing/)
})

test('places the handle left of list markers, and a moved item keeps its author', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Numbered note', '1. Mine\n')
  await api(
    request,
    'PUT',
    `/notes/${note.id}/content`,
    { content: '1. Mine\n2. Theirs\n' },
    'claude',
  )
  await openNote(page, note.id)
  const item = page.locator('.ProseMirror li', { hasText: 'Theirs' })
  const box = (await item.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 60, y)
  await page.mouse.move(box.x - 40, y, { steps: 12 })
  const handle = page.locator('button[data-slot="handle"]')
  await expect(handle).toBeVisible()
  // Left of the "2." marker, which is drawn in the list's margin.
  const list = (await page.locator('.ProseMirror ol').boundingBox())!
  const grip = (await handle.boundingBox())!
  expect(grip.x + grip.width).toBeLessThanOrEqual(list.x + 1)

  // Claude's item moves above mine: both keep their author (no renumbering takeover).
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 4 })
  const target = (await page.locator('.ProseMirror li', { hasText: 'Mine' }).boundingBox())!
  await page.mouse.down()
  await page.mouse.move(target.x + 4, target.y + 3, { steps: 16 })
  await page.mouse.up()
  await expect.poll(() => noteContent(request, note.id)).toBe('1. Theirs\n2. Mine\n')
  const blame = await api<{ count: number; author: string }[]>(
    request,
    'GET',
    `/notes/${note.id}/blame`,
  )
  expect(blame.flatMap((r) => Array.from({ length: r.count }, () => r.author))).toEqual([
    'claude',
    'owner',
  ])
})

test('inserts an emoji from the : menu (its list loads after the note)', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Emoji note', 'Party\n')
  await openNote(page, note.id)
  await page.locator('.ProseMirror p', { hasText: 'Party' }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' :tada')
  await page.getByRole('option', { name: /tada/ }).first().click()
  await expect.poll(() => noteContent(request, note.id)).toBe('Party 🎉\n')
})

test('gives a page an emoji or an image icon, after its creation', async ({ page, request }) => {
  const note = await createNote(request, 'Icon note', 'Text.')
  await openNote(page, note.id)
  const row = page.getByTestId('tree-Icon note')
  const titleIcon = page.getByRole('button', { name: 'Change icon' }).getByTestId('node-icon')

  // Every page has an icon: the default one, until another is chosen.
  await expect(titleIcon.locator('.i-lucide\\:file-text')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add icon' })).toHaveCount(0)

  // Emoji, from the page itself.
  await page.getByRole('button', { name: 'Change icon' }).click()
  const picker = page.getByTestId('icon-picker')
  // Groups are tabs, named above the emojis.
  await expect(picker.getByTestId('emoji-group-name')).toHaveText('Smileys')
  await picker.getByRole('tab', { name: 'Nature' }).click()
  await expect(picker.getByRole('tab', { name: 'Nature' })).toHaveAttribute('aria-selected', 'true')
  await expect(picker.getByTestId('emoji-group-name')).toHaveText('Nature')
  await picker.getByLabel('Search emojis').fill('rocket')
  await picker.getByRole('button', { name: 'rocket', exact: true }).click()
  await expect(row.getByTestId('node-icon')).toHaveText('🚀')
  expect((await resolve(request, note.id)).icon).toEqual({ type: 'emoji', emoji: '🚀' })

  // Image, from the computer.
  await page.getByRole('button', { name: 'Change icon' }).click()
  await page.getByTestId('icon-upload').setInputFiles({
    name: 'icon.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
  })
  const image = row.getByTestId('node-icon').locator('img')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)

  // Removed from the tree's menu.
  await row.hover()
  await row.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Change icon…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Use the default icon' }).click()
  await expect(row.getByTestId('node-icon').locator('img')).toHaveCount(0)
  expect((await resolve(request, note.id)).icon).toBeNull()
  await expect(titleIcon.locator('.i-lucide\\:file-text')).toBeVisible()
})

test('opening a note never saves it (nor takes its authorship)', async ({ page, request }) => {
  // Markdown the editor would write differently: table padding, a backslash, angle brackets.
  // Ending with a list: the editor appends an empty paragraph on its first transaction, which
  // the image's loading triggers.
  const note = await createNote(request, 'Untouched note', '', 'claude')
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  await request.post(`/api/notes/${note.id}/attachments`, {
    multipart: {
      file: { name: 'dot.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
    },
  })
  const content =
    '| A | Longer header |\n| --- | --- |\n| ⌘\\ | </> |\n\n![dot](Untouched%20note.assets/dot.png)\n\n- one\n- two\n'
  await api(request, 'PUT', `/notes/${note.id}/content`, { content }, 'claude')
  await openNote(page, note.id)
  await expect
    .poll(() =>
      page.locator('.ProseMirror img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1)
  await page.waitForTimeout(1500)
  expect(await noteContent(request, note.id)).toBe(content)
  const blame = await api<{ author: string }[]>(request, 'GET', `/notes/${note.id}/blame`)
  expect(new Set(blame.map((range) => range.author))).toEqual(new Set(['claude']))
  await expect(page.getByTestId('save-status')).toHaveCount(0)
})

test('shows diagrams alone in read mode, with their code in edit mode', async ({
  page,
  request,
}) => {
  const note = await createNote(
    request,
    'Diagram note',
    'Intro.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n',
  )
  await openNote(page, note.id)
  const source = page.getByTestId('code-block-source')
  const diagram = page.locator('.ProseMirror svg[id^="mermaid"]')
  await expect(diagram).toBeVisible()
  await expect(source).toBeHidden()

  // Toggle from the block's toolbar.
  await diagram.hover()
  await page.getByRole('button', { name: 'Edit the diagram' }).click()
  await expect(source).toBeVisible()
  await expect(source).toContainText('A --> B')
  await expect(diagram).toBeVisible()
  await page.getByRole('button', { name: 'Show the diagram only' }).click()
  await expect(source).toBeHidden()

  // Or double-click the diagram.
  await diagram.dblclick()
  await expect(source).toBeVisible()
  // Nothing changed in the note.
  expect(await noteContent(request, note.id)).toBe(
    'Intro.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n',
  )
})

test('edits with VS Code shortcuts, listed in Docs › Shortcuts', async ({ page, request }) => {
  const note = await createNote(request, 'Keys note', 'One\n\nTwo\n\nThree\n')
  await openNote(page, note.id)
  const paragraph = (text: string) => page.locator('.ProseMirror p', { hasText: text })

  // ⌥↓ moves the block, ⇧⌥↓ duplicates it, ⌘⇧K deletes it.
  await paragraph('One').click()
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => noteContent(request, note.id)).toBe('Two\n\nOne\n\nThree\n')
  await page.keyboard.press('Shift+Alt+ArrowDown')
  await expect.poll(() => noteContent(request, note.id)).toBe('Two\n\nOne\n\nOne\n\nThree\n')
  await page.keyboard.press('ControlOrMeta+Shift+K')
  await expect.poll(() => noteContent(request, note.id)).toBe('Two\n\nOne\n\nThree\n')

  // ⌘D twice selects two occurrences; typing replaces both.
  await api(request, 'PUT', `/notes/${note.id}/content`, { content: 'cat and cat\n' }, 'claude')
  await expect(paragraph('cat and cat')).toBeVisible()
  await paragraph('cat and cat').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('ControlOrMeta+D')
  await page.keyboard.press('ControlOrMeta+D')
  await page.keyboard.type('dog')
  await expect.poll(() => noteContent(request, note.id)).toBe('dog and dog\n')

  // ⌘/ opens the page listing them.
  await page.keyboard.press('ControlOrMeta+/')
  await expect(page).toHaveURL(/\/docs\/shortcuts$/)
  await expect(page.getByTestId('shortcut').filter({ hasText: 'Move up or down' })).toHaveCount(2)
  await expect(
    page.getByTestId('shortcut').filter({ hasText: 'Select all occurrences' }),
  ).toBeVisible()
  // Every icon is bundled (none missing: icons named in .ts files too).
  const missing = await page
    .locator('.iconify')
    .evaluateAll((icons) =>
      icons
        .filter((icon) => getComputedStyle(icon).maskImage === 'none')
        .map((icon) => icon.className),
    )
  expect(missing).toEqual([])
})

test('finds and replaces in the note (⌘F), and searches all notes (⌘⇧F)', async ({
  page,
  request,
}) => {
  const note = await createNote(request, 'Find note', 'Red apple, green apple.\n\nApple pie.\n')
  await openNote(page, note.id)
  // The selected word is the query.
  await page
    .locator('.ProseMirror p', { hasText: 'Red apple' })
    .dblclick({ position: { x: 50, y: 8 } })
  // The editor reads the browser's selection asynchronously (selectionchange).
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('apple')
  await page.keyboard.press('ControlOrMeta+F')
  const bar = page.getByTestId('find-bar')
  await expect(bar.getByLabel('Find in the note')).toHaveValue('apple')
  await expect(page.getByTestId('find-count')).toHaveText(/of 3/)
  await page.keyboard.press('Enter')
  await expect(page.locator('.ProseMirror .find-match--current')).toHaveCount(1)
  await bar.getByRole('button', { name: 'Match case' }).click()
  await expect(page.getByTestId('find-count')).toHaveText(/of 2/)

  // Replace all, from the replace field.
  await bar.getByRole('button', { name: 'Show replace' }).click()
  await bar.getByLabel('Replace with').fill('pear')
  await bar.getByRole('button', { name: 'Replace all' }).click()
  await expect
    .poll(() => noteContent(request, note.id))
    .toBe('Red pear, green pear.\n\nApple pie.\n')
  await page.keyboard.press('Escape')
  await expect(bar).toHaveCount(0)
  await expect(page.locator('.ProseMirror .find-match')).toHaveCount(0)

  // ⌘K isn't a shortcut: ⌘⇧F is the only one for the search palette.
  await page.keyboard.press('ControlOrMeta+K')
  await expect(page.getByPlaceholder(/Search notes/)).toHaveCount(0)

  // ⌘⇧F: the search palette, with the selected text.
  await page
    .locator('.ProseMirror p', { hasText: 'Apple pie' })
    .dblclick({ position: { x: 10, y: 8 } })
  await page.keyboard.press('ControlOrMeta+Shift+F')
  await expect(page.getByPlaceholder(/Search notes/)).toHaveValue('Apple')
})

test('types the title of a new page at once, however the page was created', async ({
  page,
  request,
}) => {
  const parent = await createNote(request, 'Focus parent')
  await page.goto(`/notes/${parent.id}`)
  const title = page.getByLabel('Title', { exact: true })

  // From a row's ⋯ menu: once closed, the menu must not take the focus back.
  await page.getByTestId('tree-Focus parent').hover()
  await page.getByTestId('tree-Focus parent').getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'New page inside' }).click()
  await expect(title).toHaveValue(/^Untitled/)
  // Once the menu has closed (when it would take the focus back).
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(title).toBeFocused()
  await page.keyboard.type('From the menu')
  await expect(title).toHaveValue('From the menu')

  // From a row's right-click menu.
  await page.getByTestId('tree-Focus parent').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'New page inside' }).click()
  await expect(title).toHaveValue(/^Untitled/)
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(title).toBeFocused()
  await page.keyboard.type('From the row')
  await expect(title).toHaveValue('From the row')
})

test('manages pages from the tree with the keyboard and the menu', async ({ page, request }) => {
  await createNote(request, 'Key first')
  const second = await createNote(request, 'Key second')
  await page.goto('/')
  const row = (title: string) => page.getByTestId(`tree-${title}`)
  const order = async () =>
    (
      await api<{ title: string; parentId: string | null; position: number }[]>(
        request,
        'GET',
        '/tree',
      )
    )
      .filter((n) => n.title.startsWith('Key ') && n.parentId === null)
      .toSorted((a, b) => a.position - b.position)
      .map((n) => n.title)

  // ⌥↑ moves it up among its siblings.
  await row('Key second').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(order).toEqual(['Key second', 'Key first'])

  // F2 renames.
  await row('Key second').focus()
  await page.keyboard.press('F2')
  // The field focuses itself once mounted.
  await expect(page.getByLabel('New title')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Key renamed')
  await page.keyboard.press('Enter')
  await expect(row('Key renamed')).toBeVisible()

  // ⌘⌫ moves it to the trash at once; Undo brings it back.
  await row('Key renamed').focus()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await expect(row('Key renamed')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(row('Key renamed')).toBeVisible()
  expect((await resolve(request, second.id)).title).toBe('Key renamed')

  // The menu shows these shortcuts.
  await row('Key renamed').hover()
  await row('Key renamed').getByRole('button', { name: 'Actions' }).click()
  await expect(page.getByRole('menuitem', { name: /Move to trash/ }).locator('kbd')).toHaveCount(2)
  await page.keyboard.press('Escape')

  // A right-click on the row opens the same menu.
  await row('Key first').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await expect(page.getByLabel('New title')).toBeFocused()
  await expect(page.getByLabel('New title')).toHaveValue('Key first')
  await page.keyboard.press('Escape')

  // Below the pages, the menu creates one (only pages: no folders to create).
  const area = page.getByTestId('tree-menu-area')
  const box = await area.boundingBox()
  await area.click({ button: 'right', position: { x: 20, y: (box?.height ?? 0) - 5 } })
  await expect(page.getByRole('menuitem', { name: /^New page/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /folder/i })).toHaveCount(0)
})

test('shows a pointer on everything clickable', async ({ page, request }) => {
  await createNote(request, 'Pointer note')
  await page.goto('/')
  for (const clickable of [
    page.getByRole('button', { name: 'New page', exact: true }).first(),
    page.getByTestId('tree-Pointer note'),
    page.getByRole('link', { name: 'Trash' }),
  ])
    await expect(clickable).toHaveCSS('cursor', 'pointer')

  await page.keyboard.press('ControlOrMeta+Shift+F')
  await expect(page.getByRole('option').first()).toHaveCSS('cursor', 'pointer')
  // Text fields keep the text cursor.
  await expect(page.getByPlaceholder(/Search notes/)).not.toHaveCSS('cursor', 'pointer')
})

test('copies the Markdown from a button shown on hover in the Markdown view', async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const note = await createNote(request, 'Copy note', '# Copy me\n\nSome **text**.\n')
  await openNote(page, note.id)
  await page.getByRole('button', { name: 'Markdown source' }).click()
  const source = page.getByRole('textbox', { name: 'Markdown source' })
  const copy = page.getByRole('button', { name: 'Copy Markdown' })
  await page.mouse.move(0, 0)
  await expect(copy).toHaveCSS('opacity', '0')
  await source.hover()
  await expect(copy).toHaveCSS('opacity', '1')
  await copy.click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '# Copy me\n\nSome **text**.\n',
  )
})

test('highlights the heading being read in the Headings panel', async ({ page, request }) => {
  const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} of a long section.`).join(
    '\n\n',
  )
  const note = await createNote(
    request,
    'Headings note',
    `# Alpha\n\n${long}\n\n## Beta\n\n${long}\n\n## Gamma\n\nShort.\n\n## Delta\n\nShort.\n`,
  )
  await openNote(page, note.id)
  const headings = page.getByRole('navigation', { name: 'Headings' })
  const current = headings.locator('[aria-current="location"]')
  const indicator = page.getByTestId('outline-indicator')
  const heading = (name: string) => page.locator('.ProseMirror').getByRole('heading', { name })

  // Reading Beta: it reaches the top of the note.
  await heading('Beta').evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await expect(current).toHaveText('Beta')
  await expect
    .poll(async () => (await indicator.boundingBox())?.y)
    .toBeCloseTo((await current.boundingBox())!.y, 0)

  // At the end, the last section counts, though it can't scroll to the top.
  await page.mouse.move(500, 400)
  await page.mouse.wheel(0, 10_000)
  await expect(current).toHaveText('Delta')

  // A heading picked in the panel stays current, until the reader scrolls.
  await headings.getByRole('button', { name: 'Gamma' }).click()
  await expect(current).toHaveText('Gamma')
  await page.waitForTimeout(800)
  await expect(current).toHaveText('Gamma')
  await page.mouse.move(500, 400)
  await page.mouse.wheel(0, -2000)
  await expect(current).not.toHaveText('Gamma')

  // Back at the top: Alpha.
  await page.mouse.wheel(0, -10_000)
  await expect(current).toHaveText('Alpha')
})

test('scrolls smoothly to a heading picked in the Headings panel, down and up', async ({
  page,
  request,
}) => {
  const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
  const note = await createNote(
    request,
    'Heading jumps',
    `# One\n\n${long}\n\n## Two\n\n${long}\n\n## Three\n\n${long}\n`,
  )
  await openNote(page, note.id)
  const headings = page.getByRole('navigation', { name: 'Headings' })
  /** Whether the heading is at the top of the note (below its 5rem scroll margin), or the note
   * at its very top (the first heading is under the title). */
  const atTop = (name: string) =>
    page
      .locator('.ProseMirror')
      .getByRole('heading', { name })
      .evaluate((heading) => {
        const scroller = heading.closest('.overflow-y-auto')!
        const offset = heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        return scroller.scrollTop === 0 || Math.abs(offset - 80) < 4
      })
  for (const name of ['Three', 'One', 'Two', 'One']) {
    await headings.getByRole('button', { name }).click()
    await expect.poll(() => atTop(name)).toBe(true)
    await expect(page.locator('.ProseMirror')).toBeFocused()
  }
})

test('colors code blocks with the code theme chosen in Settings, light and dark', async ({
  page,
  request,
}) => {
  const note = await createNote(
    request,
    'Code theme note',
    "```javascript\n// A comment\nconst greeting = 'Hello'\n```\n",
  )
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Code theme: Tomorrow' }).click()
  await expect
    .poll(async () => (await api<{ codeTheme: string }>(request, 'GET', '/settings')).codeTheme)
    .toBe('tomorrow')

  // Tomorrow in light mode, Tomorrow Night Eighties in dark mode.
  await openNote(page, note.id)
  const block = page.locator('.ProseMirror pre')
  await expect(block).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(block.locator('.hljs-string')).toHaveCSS('color', 'rgb(113, 140, 0)')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(block).toHaveCSS('background-color', 'rgb(45, 45, 45)')
  await expect(block.locator('.hljs-string')).toHaveCSS('color', 'rgb(153, 204, 153)')
  await expect(block.locator('.hljs-keyword')).toHaveCSS('color', 'rgb(204, 153, 204)')
  // Keywords in italics, as the Operator Mono version of the theme.
  await expect(block.locator('.hljs-keyword')).toHaveCSS('font-style', 'italic')
  await expect(block.locator('.hljs-comment')).toHaveCSS('color', 'rgb(153, 153, 153)')
  await api(request, 'PATCH', '/settings', { codeTheme: 'tandem' })
})

test('has no landing page: it is the website, tandem.w3lt.org', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('workspace-name')).toBeVisible()
  await expect(page.getByRole('button', { name: 'About Tandem' })).toHaveCount(0)
  await page.goto('/landing')
  await expect(page.getByRole('heading', { name: 'Notes you write with your agent.' })).toHaveCount(
    0,
  )
})

test('highlights TODOs, lists them in the sidebar, and goes to one', async ({ page, request }) => {
  await api(request, 'PATCH', '/settings', { todos: true })
  const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
  const note = await createNote(
    request,
    'Todo source',
    `TODO: please remind to do this.\n\ntodo: not one, nor myTODO: this\n\n${filler}\n\n- item TODO: far below\n`,
  )
  await openNote(page, note.id)
  // The marker and the rest of its line, only in capitals and not glued to a word.
  // (Split in pieces: the marker has its own span.)
  const joined = (selector: string) =>
    page.locator(selector).evaluateAll((spans) => spans.map((span) => span.textContent).join(''))
  await expect
    .poll(() => joined('.ProseMirror .todo-highlight'))
    .toBe('TODO: please remind to do this.TODO: far below')
  const highlights = page.locator('.ProseMirror .todo-highlight')
  await expect(highlights.first()).toHaveCSS('background-color', /rgba\(253, 224, 71/)
  // The marker in the TODOs page's font.
  const markers = page.locator('.ProseMirror .todo-marker')
  await expect(markers).toHaveText(['TODO:', 'TODO:'])
  await expect(markers.first()).toHaveCSS('font-family', /JetBrains Mono/)

  // Listed by page, from the sidebar (with their count).
  const link = page.getByRole('link', { name: /TODOs/ })
  await expect(link).toContainText('2')
  await link.click()
  const section = page.getByTestId('todo-note').filter({ hasText: 'Todo source' })
  await expect(section.getByTestId('todo-item')).toHaveText([
    /please remind to do this\./,
    /far below/,
  ])

  // One click: the note, at that TODO (scrolled to, flashed, the cursor at its end).
  await section.getByTestId('todo-item').nth(1).click()
  await expect(page).toHaveURL(`/notes/${note.id}`)
  await expect.poll(() => joined('.ProseMirror .todo-flash')).toBe('TODO: far below')
  await expect(page.locator('.ProseMirror .todo-flash').first()).toBeInViewport()
  await page.keyboard.type(' now')
  await waitSaved(page)
  expect(await noteContent(request, note.id)).toContain('- item TODO: far below now')

  // A TODO typed in a note shows up at once.
  await page.keyboard.press('Enter')
  await page.keyboard.type('TODO: one more')
  await expect(link).toContainText('3')
  await api(request, 'PATCH', '/settings', { todos: false })
})

test('names the side panel tabs by tooltips, icons only', async ({ page, request }) => {
  const note = await createNote(request, 'Panel tabs', 'Text')
  await openNote(page, note.id)
  const panel = page.locator('#tandem-panels-panel-note-side')
  if (!(await panel.isVisible()))
    await page.getByRole('button', { name: 'Toggle side panel' }).click()
  const files = panel.getByRole('tab', { name: 'Files' })
  await expect(files).toHaveText('')
  await files.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Files')
  await files.click()
  await expect(files).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('tab', { name: 'Headings' })).toHaveAttribute(
    'aria-selected',
    'false',
  )

  // Empty tabs say so the same way.
  for (const [tab, title] of [
    ['Headings', 'No headings'],
    ['Links', 'No links'],
    ['Databases', 'No databases'],
  ]) {
    await panel.getByRole('tab', { name: tab }).click()
    await expect(panel.locator('[data-slot="title"]', { hasText: title })).toBeVisible()
  }
})

test('resizes the side panel from its left edge, remembered', async ({ page, request }) => {
  const note = await createNote(request, 'Wide panel', 'Text')
  await openNote(page, note.id)
  const panel = page.locator('#tandem-panels-panel-note-side')
  if (!(await panel.isVisible()))
    await page.getByRole('button', { name: 'Toggle side panel' }).click()
  const width = async () => (await panel.boundingBox())!.width
  const before = await width()
  const handle = page.getByTestId('side-panel-resize')
  const box = (await handle.boundingBox())!
  const y = box.y + 200
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 80, y, { steps: 5 })
  await page.mouse.up()
  // Dragged left: wider by as much.
  expect(Math.round((await width()) - before)).toBe(80)
  await page.reload()
  await expect(panel).toBeVisible()
  expect(Math.round((await width()) - before)).toBe(80)
  // Double-click: the default width (21rem).
  // (The handle is a 0-wide line; its grab area is a pseudo-element: by coordinates.)
  const after = (await page.getByTestId('side-panel-resize').boundingBox())!
  await page.mouse.dblclick(after.x + after.width / 2, after.y + 200)
  expect(Math.round(await width())).toBe(21 * 16)
})

test('checks spelling only when Settings turn it on', async ({ page, request }) => {
  const note = await createNote(request, 'Spelling', 'Text')
  await openNote(page, note.id)
  // Off by default: the editor and the title inherit it from the page.
  const spellcheck = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element: HTMLElement) => element.spellcheck)
  expect(await spellcheck('.ProseMirror')).toBe(false)
  expect(await spellcheck('input[aria-label="Title"]')).toBe(false)

  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Spell check' }).click()
  await expect
    .poll(async () => (await api<{ spellcheck: boolean }>(request, 'GET', '/settings')).spellcheck)
    .toBe(true)
  await openNote(page, note.id)
  expect(await spellcheck('.ProseMirror')).toBe(true)
  await api(request, 'PATCH', '/settings', { spellcheck: false })
})

test('scrolls to the match found in a long note, and to the next one', async ({
  page,
  request,
}) => {
  const filler = Array.from({ length: 60 }, (_, i) => `Filler paragraph ${i}.`).join('\n\n')
  const note = await createNote(
    request,
    'Long find',
    `${filler}\n\nA zebra here.\n\n${filler}\n\nAnother zebra there.\n`,
  )
  await openNote(page, note.id)
  // The cursor at the top of the note.
  await page.locator('.ProseMirror p').first().click()
  await page.keyboard.press('ControlOrMeta+F')
  const bar = page.getByTestId('find-bar')
  await bar.getByLabel('Find in the note').fill('zebra')
  const count = page.getByTestId('find-count')
  const current = page.locator('.ProseMirror .find-match--current')
  // The first match, far below the top: shown.
  await expect(count).toHaveText('1 of 2')
  await expect(current).toHaveText('zebra')
  await expect(current).toBeInViewport()
  // ↵ (and the button): the next one, further down, shown too; then back to the first.
  await bar.getByLabel('Find in the note').press('Enter')
  await expect(count).toHaveText('2 of 2')
  await expect(current).toBeInViewport()
  await expect(current.locator('xpath=..')).toContainText('Another zebra')
  await bar.getByRole('button', { name: 'Next match' }).click()
  await expect(count).toHaveText('1 of 2')
  await expect(current).toBeInViewport()
})

test('shows a page without content but with child pages as a folder, until written in', async ({
  page,
  request,
}) => {
  const parent = await createNote(request, 'Areas', '')
  await api(request, 'POST', '/notes', { title: 'Health', parentId: parent.id, content: 'Run' })
  await page.goto('/')
  const row = page.getByTestId('tree-Areas')
  await expect(row.locator('.i-lucide\\:folder')).toBeVisible()

  // A click opens it: a placeholder saying how to make it a note, and its pages listed.
  await row.click()
  await expect(page).toHaveURL(`/notes/${parent.id}`)
  await expect(page.locator('.ProseMirror p[data-placeholder]').first()).toHaveAttribute(
    'data-placeholder',
    'Write here to turn this folder into a note.',
  )
  const pages = page.getByTestId('sub-pages')
  await expect(pages.getByRole('link')).toHaveText(['Health'])

  // Written in: a page (the list goes); emptied: a folder again, on disk too.
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Overview')
  await waitSaved(page)
  await expect(row.locator('.i-lucide\\:file-text')).toBeVisible()
  await expect(pages).toHaveCount(0)
  const kind = async () =>
    (await api<{ id: string; kind: string }[]>(request, 'GET', '/tree')).find(
      (n) => n.id === parent.id,
    )?.kind
  expect(await kind()).toBe('page')
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  await expect.poll(kind).toBe('folder')
  await expect(row.locator('.i-lucide\\:folder')).toBeVisible()
  await expect(pages.getByRole('link')).toHaveText(['Health'])
  await pages.getByRole('link', { name: 'Health' }).click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Health')
})
