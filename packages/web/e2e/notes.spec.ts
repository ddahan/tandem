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

  const title = page.getByLabel('Title')
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
})

test('renames a note from its title, keeping links working', async ({ page, request }) => {
  const note = await createNote(request, 'Old title', 'Content')
  await createNote(request, 'Linker', 'Points to [[Old title]].')
  await openNote(page, note.id)
  const title = page.getByLabel('Title')
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
  await page.getByRole('tab', { name: 'History' }).click()
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
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png })
  const image = page.locator('.ProseMirror img')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await expect
    .poll(() => noteContent(request, note.id))
    .toContain('![pixel.png](Attachments%20note.assets/pixel.png)')
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

test('changes the theme and the settings', async ({ page, request }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'emerald' }).click()
  await expect
    .poll(
      async () => (await api<{ primaryColor: string }>(request, 'GET', '/settings')).primaryColor,
    )
    .toBe('emerald')
  await page.getByRole('button', { name: 'Dark', exact: true }).first().click()
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

test('switches the color mode from one theme button', async ({ page }) => {
  await page.goto('/')
  const button = page.getByRole('button', { name: /^Theme: / })
  await expect(button).toHaveCount(1)
  await expect(button).toHaveAccessibleName('Theme: System')
  await chooseTheme(page, 'Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(button).toHaveAccessibleName('Theme: Dark')
  // The menu marks the current choice.
  await button.click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Dark' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.getByRole('menuitemcheckbox', { name: 'Light' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(button).toHaveAccessibleName('Theme: Light')
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
  await api(request, 'PATCH', '/settings', { primaryColor: 'indigo', backgroundTone: 'white' })
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
  await page.getByRole('button', { name: 'Light', exact: true }).first().click()
  await page.getByRole('button', { name: 'Background: Paper' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-tone', 'paper')
  const background = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim(),
    )
  await expect.poll(background).toBe('#fbf8f1')
  await page.getByRole('button', { name: 'Dark', exact: true }).first().click()
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
  await api(request, 'PATCH', '/settings', { primaryColor: 'indigo' })
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

test('edits with VS Code shortcuts, listed on the Shortcuts page', async ({ page, request }) => {
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
  await expect(page).toHaveURL(/\/shortcuts$/)
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
  const title = page.getByLabel('Title')

  // From a menu: once closed, the menu must not take the focus back.
  await page.getByRole('button', { name: 'New page or folder' }).click()
  await page.getByRole('menuitem', { name: /^New page/ }).click()
  await expect(title).toHaveValue(/^Untitled/)
  // After the menu's closing animation.
  await page.waitForTimeout(500)
  await page.keyboard.type('From the menu')
  await expect(title).toHaveValue('From the menu')

  // From a row's right-click menu.
  await page.getByTestId('tree-Focus parent').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'New page inside' }).click()
  await expect(title).toHaveValue(/^Untitled/)
  await page.waitForTimeout(500)
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

  // Below the pages, the menu creates them.
  const area = page.getByTestId('tree-menu-area')
  const box = await area.boundingBox()
  await area.click({ button: 'right', position: { x: 20, y: (box?.height ?? 0) - 5 } })
  await expect(page.getByRole('menuitem', { name: 'New folder', exact: true })).toBeVisible()
})

test('shows a pointer on everything clickable', async ({ page, request }) => {
  await createNote(request, 'Pointer note')
  await page.goto('/')
  for (const clickable of [
    page.getByRole('button', { name: /^Theme: / }),
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

test('highlights the heading being read in the outline', async ({ page, request }) => {
  const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} of a long section.`).join(
    '\n\n',
  )
  const note = await createNote(
    request,
    'Outline note',
    `# Alpha\n\n${long}\n\n## Beta\n\n${long}\n\n## Gamma\n\nShort.\n\n## Delta\n\nShort.\n`,
  )
  await openNote(page, note.id)
  const outline = page.getByRole('navigation', { name: 'Outline' })
  const current = outline.locator('[aria-current="location"]')
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

  // A heading picked in the outline stays current, until the reader scrolls.
  await outline.getByRole('button', { name: 'Gamma' }).click()
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

test('scrolls smoothly to a heading picked in the outline, down and up', async ({
  page,
  request,
}) => {
  const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
  const note = await createNote(
    request,
    'Outline jumps',
    `# One\n\n${long}\n\n## Two\n\n${long}\n\n## Three\n\n${long}\n`,
  )
  await openNote(page, note.id)
  const outline = page.getByRole('navigation', { name: 'Outline' })
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
    await outline.getByRole('button', { name }).click()
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

test('shows the landing page over the app, from the sidebar', async ({ page, request }) => {
  const note = await createNote(request, 'About note', 'Text.')
  await openNote(page, note.id)
  await page.getByRole('button', { name: 'About Tandem' }).click()
  const frame = page.frameLocator('[data-testid="landing-frame"]')
  await expect(frame.getByRole('heading', { level: 1 })).toBeVisible()

  // Escape closes it, even with the focus in the page.
  await frame.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('landing-frame')).toHaveCount(0)
  await page.getByRole('button', { name: 'About Tandem' }).click()

  // Its links into the app close the modal and go there, instead of opening the app inside.
  await frame.getByRole('link', { name: 'Open the app' }).first().click()
  await expect(page.getByTestId('landing-frame')).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
})
