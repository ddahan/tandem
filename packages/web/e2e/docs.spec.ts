// The Docs: the sidebar's entry, one address per tab, the blocks shown by the editor itself, and
// the agents' MCP command at Tandem's own address.
import { expect, test } from '@playwright/test'

test('opens the Docs from the sidebar, a tab per address', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Docs', exact: true }).first().click()
  await expect(page).toHaveURL(/\/docs\/install$/)

  const tabs = page.getByRole('navigation', { name: 'Docs' })
  await tabs.getByRole('link', { name: 'Concepts' }).click()
  await expect(page).toHaveURL(/\/docs\/concepts$/)
  await expect(page.getByTestId('concept').first()).toBeVisible()
  await expect(page).toHaveTitle(/^Concepts/)

  await tabs.getByRole('link', { name: 'Shortcuts' }).click()
  await expect(page.getByTestId('shortcut').first()).toBeVisible()

  // The old address still leads there.
  await page.goto('/shortcuts')
  await expect(page).toHaveURL(/\/docs\/shortcuts$/)
})

test('shows every block in the read-only editor, next to its Markdown', async ({ page }) => {
  await page.goto('/docs/blocks')
  const block = (id: string) => page.locator(`#block-${id}`)

  await expect(block('callouts').locator('.callout')).toHaveCount(5)
  await expect(block('table').locator('.ProseMirror table')).toBeVisible()
  await expect(block('file').locator('a.file-chip')).toHaveCount(2)
  await expect(block('wiki-links').locator('.wiki-link').first()).toBeVisible()
  // Diagrams are drawn, without their code (read-only: never in edit mode).
  await expect(block('mermaid').locator('svg').first()).toBeVisible()
  await expect(block('mermaid').locator('.ProseMirror pre')).toBeHidden()
  await expect(block('callouts').getByLabel('Markdown')).toContainText('> [!WARNING]')

  // Read-only.
  await expect(block('headings').locator('.ProseMirror')).toHaveAttribute(
    'contenteditable',
    'false',
  )
})

test('gives the MCP command at Tandem’s own address', async ({ page, baseURL }) => {
  await page.goto('/docs/agents')
  await expect(page.getByTestId('mcp-command')).toContainText(`${new URL(baseURL!).origin}/mcp`)
})
