// Which tab a page is shown in (composables/useTabs.ts): pure, for unit tests.

/** The tab a path is shown in: `note:<id>`, an app page's name, or none (Home). */
export function tabKeyOf(path: string): string | null {
  const note = /^\/notes\/([^/?#]+)/.exec(path)
  if (note) return `note:${note[1]}`
  const page = /^\/(docs|settings|todos|trash)(?:[/?#]|$)/.exec(path)
  return page ? page[1]! : null
}

/** The note a tab shows, if it shows one. */
export function noteIdOf(key: string): string | null {
  return key.startsWith('note:') ? key.slice(5) : null
}
