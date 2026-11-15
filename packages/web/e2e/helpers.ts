import { expect, type APIRequestContext, type Page } from '@playwright/test'
import type { Editor } from '@tiptap/core'

/** Calls the API like an agent would (or as the owner). */
export async function api<T = unknown>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  author = 'owner',
): Promise<T> {
  const response = await request.fetch(`/api${path}`, {
    method,
    headers: { 'x-tandem-author': author },
    data: body,
  })
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

interface Node {
  id: string
  path: string
  title: string
  icon: unknown
}

export function createNote(
  request: APIRequestContext,
  title: string,
  content = '',
  author = 'owner',
  parentId?: string,
) {
  return api<Node>(request, 'POST', '/notes', { title, content, parentId }, author)
}

export async function noteContent(request: APIRequestContext, ref: string): Promise<string> {
  const node = await api<Node>(request, 'GET', `/resolve?ref=${encodeURIComponent(ref)}`)
  return (await api<{ content: string }>(request, 'GET', `/notes/${node.id}`)).content
}

export function resolve(request: APIRequestContext, ref: string) {
  return api<Node>(request, 'GET', `/resolve?ref=${encodeURIComponent(ref)}`)
}

/** Opens a note and waits for its editor. */
export async function openNote(page: Page, id: string) {
  await page.goto(`/notes/${id}`)
  await expect(page.locator('.ProseMirror')).toBeVisible()
}

/** Puts the cursor at the very end of the editor. */
export async function focusEnd(page: Page) {
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('ControlOrMeta+End')
  await caretRead(page)
}

/**
 * Waits until the editor knows where the caret is. After a click or a key that moves the caret
 * (End, an arrow), the editor reads its place when the browser reports it, a few milliseconds
 * later: a key it handles itself (Enter, Tab…) pressed sooner, as only a test can, would act
 * where the caret was before.
 */
export async function caretRead(page: Page) {
  await page.waitForFunction(() => {
    const dom = document.querySelector('.ProseMirror') as unknown as { editor?: Editor } | null
    const selection = getSelection()
    const editor = dom?.editor
    if (!editor || !selection?.anchorNode || !editor.view.dom.contains(selection.anchorNode)) {
      return false
    }
    const anchor = editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset)
    return anchor === editor.state.selection.anchor
  })
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('Saved')
}

/** Picks a color mode in Settings › Appearance (going there if needed). */
export async function chooseTheme(page: Page, mode: 'Light' | 'Dark' | 'System') {
  if (!page.url().endsWith('/settings/appearance')) await page.goto('/settings/appearance')
  await page.getByRole('button', { name: `Theme: ${mode}` }).click()
}
