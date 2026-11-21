// The editor's extensions beyond what UEditor adds (starter kit, Markdown, placeholder), with
// their Markdown parsing and serialization. Pure TypeScript (no Vue components) so that the
// Markdown round-trip can be unit-tested; node views are added by the editor component.
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { FileHandler } from '@tiptap/extension-file-handler'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Extension, type AnyExtension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { MarkdownExtensionOptions } from '@tiptap/markdown'
import type { StarterKitOptions } from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { Marked } from 'marked'
import { OldAgenda, OldEvent } from './agenda'
import { BlockKeys } from './block-keys'
import { Bookmark } from './bookmark'
import { Callout } from './callout'
import { Database } from './database'
import { Details, DetailsContent, DetailsSummary } from './details'
import { DomSelection } from './dom-selection'
import { DeletedFiles, FileChips, FileLink } from './file-chips'
import { Find } from './find'
import { InlineCodeEnds } from './inline-code'
import { JoinLists } from './join-lists'
import { ListKeys } from './list-keys'
import { NestedOrderedList } from './ordered-list'
import { ListMarkers } from './list-markers'
import { NoteParagraph } from './paragraph'
import { Todos } from './todos'
import { Occurrences } from './occurrences'
import { ResizableImage, type OpenedImage } from './image'
import { WikiLink, type WikiLinkAttributes } from './wiki-link'

export const lowlight = createLowlight(common)

/**
 * The Markdown extension's options, for one editor: its own parser. By default every editor
 * registers its syntax on marked's single shared parser, and nothing removes it: each editor
 * opened made every later parse slower (the rules piled up) and stayed in memory.
 */
export function markdownOptions(): Partial<MarkdownExtensionOptions> {
  return {
    // Tiptap's types name its own marked (17); the app's (18) parses alike: the Markdown
    // round-trip tests run with it.
    marked: new Marked() as unknown as MarkdownExtensionOptions['marked'],
    markedOptions: { gfm: true },
  }
}

export interface ExtensionOptions {
  onOpenWikiLink?: (attributes: WikiLinkAttributes) => void
  /** Whether a wiki link's note exists (links to missing notes look different). */
  wikiLinkExists?: (target: string) => boolean
  onFiles?: (editor: Editor, files: File[], pos: number | null) => void
  /** The editor address of the note's attachments folder (files deleted: DeletedFiles). */
  assetsPrefix?: () => string
  /** An image double-clicked: shown full screen by the note. */
  onOpenImage?: (image: OpenedImage) => void
  /** Esc in the note that nothing in it used (extra cursors, a menu): the page's to use. */
  onEscape?: () => void
}

/**
 * Esc in the note, when nothing in it used it: ProseMirror takes every Esc (it prevents the
 * browser's), so the page can't tell from the event. Last of the editor's keys; a menu open
 * (a suggestion plugin, such as `/` or `[[`, is active) uses it.
 */
function escapeOut(onEscape: () => void) {
  return Extension.create({
    name: 'escapeOut',
    priority: 1,
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('escapeOut'),
          props: {
            handleKeyDown(view, event) {
              if (event.key !== 'Escape' || event.isComposing) return false
              const menuOpen = view.state.plugins.some(
                (plugin) =>
                  (plugin.getState(view.state) as { active?: unknown } | undefined)?.active ===
                  true,
              )
              if (!menuOpen) onEscape()
              return false
            },
          },
        }),
      ]
    },
  })
}

export function createExtensions(options: ExtensionOptions = {}): AnyExtension[] {
  return [
    DomSelection,
    NoteParagraph,
    InlineCodeEnds,
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    TableKit.configure({ table: { resizable: false } }),
    NestedOrderedList,
    TaskList,
    TaskItem.configure({ nested: true }),
    Callout,
    Database,
    Bookmark,
    OldAgenda,
    OldEvent,
    Details.configure({ persist: true, HTMLAttributes: { class: 'details' } }),
    DetailsSummary,
    DetailsContent,
    ResizableImage.configure({ onOpen: options.onOpenImage }),
    FileLink.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
    WikiLink.configure({
      onOpen: options.onOpenWikiLink ?? (() => {}),
      exists: options.wikiLinkExists ?? (() => true),
    }),
    FileChips,
    // Without a note (tests, Docs examples), no file is ever marked deleted.
    DeletedFiles.configure({ prefix: options.assetsPrefix ?? (() => '') }),
    JoinLists,
    ListMarkers,
    Todos,
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
    ...(options.onEscape ? [escapeOut(options.onEscape)] : []),
  ]
}

/**
 * UEditor's starter kit options: our paragraph, code block, link (FileLink) and numbered list
 * replace its own. (Inline code is UEditor's own mark, adjusted by InlineCodeEnds.)
 */
export const starterKitOptions: Partial<StarterKitOptions> = {
  paragraph: false,
  codeBlock: false,
  link: false,
  // NestedOrderedList replaces it (its Markdown parser).
  orderedList: false,
  heading: { levels: [1, 2, 3, 4] },
  // As many steps as the app's history keeps (useUndo): each of its text steps is one of these.
  undoRedo: { depth: 1000 },
}
