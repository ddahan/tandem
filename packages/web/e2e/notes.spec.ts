// The main flows of the app, in a real browser against the real server.
import { expect, test, type Page } from '@playwright/test'
import { api, createNote, focusEnd, noteContent, openNote, resolve, waitSaved } from './helpers'

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
  await page.getByRole('tab', { name: 'Files' }).click()
  await expect(page.getByTestId('file-icon').locator('svg')).toHaveCount(1)
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
      .locator('rect')
      .nth(1)
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

test('gives a page an emoji or an image icon, after its creation', async ({ page, request }) => {
  const note = await createNote(request, 'Icon note', 'Text.')
  await openNote(page, note.id)
  const row = page.getByTestId('tree-Icon note')

  // Emoji, from the page itself.
  await page.getByLabel('Title').hover()
  await page.getByRole('button', { name: 'Add icon' }).click()
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
  await page.getByRole('dialog').getByRole('button', { name: 'Remove the icon' }).click()
  await expect(row.getByTestId('node-icon').locator('img')).toHaveCount(0)
  expect((await resolve(request, note.id)).icon).toBeNull()
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
