// Importing Chrome's bookmarks into Tandem: the whole tree (the bookmarks bar, other bookmarks,
// mobile bookmarks, their folders), each bookmark with its favicon from Chrome's own copy. Sent
// at once; Tandem puts it in its "Chrome" folder, merging with what an earlier import left there.
import { formatNumber, type BookmarkImportNode, type BookmarkImportResult } from '@tandem/shared'

/** Favicons read at the same time (Chrome answers from its cache, quickly). */
const ICON_READS = 8

/**
 * Chrome's tree as Tandem takes it: its top folders (bookmarks bar, other, mobile) with their
 * content, those with no bookmark at all left out (mobile bookmarks, usually).
 */
export function toImportNodes(tree: chrome.bookmarks.BookmarkTreeNode[]): BookmarkImportNode[] {
  const roots = tree.flatMap((root) => root.children ?? [])
  return roots.filter((root) => countBookmarks([root]) > 0).map(toNode)
}

function toNode(node: chrome.bookmarks.BookmarkTreeNode): BookmarkImportNode {
  return node.url !== undefined
    ? { title: node.title, url: node.url }
    : { title: node.title, children: (node.children ?? []).map(toNode) }
}

/** How many bookmarks (not folders) the tree has. */
export function countBookmarks(
  nodes: (BookmarkImportNode | chrome.bookmarks.BookmarkTreeNode)[],
): number {
  return nodes.reduce(
    (sum, node) => sum + (node.url !== undefined ? 1 : countBookmarks(node.children ?? [])),
    0,
  )
}

/**
 * The tree with each bookmark's favicon (`iconOf`: a `data:` URL, or none), a few read at a
 * time; `progress` is told how many are done. Chrome's generic icon (`generic`: what it gives
 * for a page it has none of) is left out: Tandem shows its own.
 */
export async function withIcons(
  nodes: BookmarkImportNode[],
  iconOf: (url: string) => Promise<string | undefined>,
  generic: string | undefined,
  progress: (done: number) => void = () => {},
): Promise<BookmarkImportNode[]> {
  const bookmarks: BookmarkImportNode[] = []
  const collect = (list: BookmarkImportNode[]) => {
    for (const node of list) {
      if (node.children) collect(node.children)
      else bookmarks.push(node)
    }
  }
  const copy = structuredClone(nodes)
  collect(copy)
  let next = 0
  let done = 0
  const read = async () => {
    while (next < bookmarks.length) {
      const bookmark = bookmarks[next++]!
      const icon = await iconOf(bookmark.url!).catch(() => undefined)
      if (icon && icon !== generic) bookmark.iconDataUrl = icon
      progress(++done)
    }
  }
  await Promise.all(Array.from({ length: ICON_READS }, read))
  return copy
}

/** `Imported 2 bookmarks into the “Chrome” folder; 3 already in Tandem, 1 left out (…).` */
export function importSummary(result: BookmarkImportResult): string {
  const notes = [
    result.duplicates ? `${formatNumber(result.duplicates)} already in Tandem` : '',
    result.skipped ? `${formatNumber(result.skipped)} left out (not web pages)` : '',
  ].filter(Boolean)
  const added = result.bookmarks
    ? `Imported ${formatNumber(result.bookmarks)} bookmark${result.bookmarks === 1 ? '' : 's'} into the “Chrome” folder`
    : 'Nothing new to import'
  return `${added}${notes.length ? `; ${notes.join(', ')}` : ''}.`
}
