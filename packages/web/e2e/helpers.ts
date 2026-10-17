import { expect, type APIRequestContext, type Page } from '@playwright/test'

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
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('Saved')
}

/** Picks a color mode from the sidebar's theme menu. */
export async function chooseTheme(page: Page, mode: 'Light' | 'Dark' | 'System') {
  await page.getByRole('button', { name: /^Theme: / }).click()
  await page.getByRole('menuitemcheckbox', { name: mode }).click()
}
