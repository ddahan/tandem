// The editor's extensions beyond what UEditor adds (starter kit, Markdown, placeholder), with
// their Markdown parsing and serialization. Pure TypeScript (no Vue components) so that the
// Markdown round-trip can be unit-tested; node views are added by the editor component.
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { FileHandler } from '@tiptap/extension-file-handler'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import type { AnyExtension, Editor } from '@tiptap/core'
import type { StarterKitOptions } from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { BlockKeys } from './block-keys'
import { Callout } from './callout'
import { Database } from './database'
import { Details, DetailsContent, DetailsSummary } from './details'
import { FileChips, FileLink } from './file-chips'
import { Find } from './find'
import { JoinLists } from './join-lists'
import { ListKeys } from './list-keys'
import { NestedOrderedList } from './ordered-list'
import { ListMarkers } from './list-markers'
import { Occurrences } from './occurrences'
import { ResizableImage } from './image'
import { WikiLink, type WikiLinkAttributes } from './wiki-link'

export const lowlight = createLowlight(common)

export interface ExtensionOptions {
  onOpenWikiLink?: (attributes: WikiLinkAttributes) => void
  /** Whether a wiki link's note exists (links to missing notes look different). */
  wikiLinkExists?: (target: string) => boolean
  onFiles?: (editor: Editor, files: File[], pos: number | null) => void
}

export function createExtensions(options: ExtensionOptions = {}): AnyExtension[] {
  return [
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    TableKit.configure({ table: { resizable: false } }),
    NestedOrderedList,
    TaskList,
    TaskItem.configure({ nested: true }),
    Callout,
    Database,
    Details.configure({ persist: true, HTMLAttributes: { class: 'details' } }),
    DetailsSummary,
    DetailsContent,
    ResizableImage,
    FileLink.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
    WikiLink.configure({
      onOpen: options.onOpenWikiLink ?? (() => {}),
      exists: options.wikiLinkExists ?? (() => true),
    }),
    FileChips,
    JoinLists,
    ListMarkers,
    ListKeys,
    BlockKeys,
    Occurrences,
    Find,
    FileHandler.configure({
      onDrop: (editor, files, pos) => options.onFiles?.(editor, files, pos),
      onPaste: (editor, files, htmlContent) => {
        // Pasted HTML with images (from a web page) is handled by the editor itself.
        if (htmlContent) return
        options.onFiles?.(editor, files, null)
      },
    }),
  ]
}

/** UEditor's starter kit options: our code block, link (FileLink) and numbered list replace its own. */
export const starterKitOptions: Partial<StarterKitOptions> = {
  codeBlock: false,
  link: false,
  // NestedOrderedList replaces it (its Markdown parser).
  orderedList: false,
  heading: { levels: [1, 2, 3, 4] },
}
