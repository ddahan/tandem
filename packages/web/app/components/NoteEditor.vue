<script setup lang="ts">
// The note editor: Nuxt UI's Editor (TipTap, Markdown in and out) with our extensions, a slash
// menu, a selection toolbar, a table toolbar, emoji and `[[` link menus, block drag handles,
// and file drops/pastes (uploaded to the note's attachments).
import type { EditorCustomHandlers, EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui'
import type { EmojiItem } from '@tiptap/extension-emoji'
import type { Editor as CoreEditor } from '@tiptap/core'
import { VueNodeViewRenderer, type Editor } from '@tiptap/vue-3'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { closeHistory, undoDepth } from '@tiptap/pm/history'
import type { Transaction } from '@tiptap/pm/state'
import type { TreeNode } from '@tandem/shared'
import { linkKey } from '@tandem/shared'
import CalloutView from '~/components/editor/CalloutView.vue'
import CodeBlockView from '~/components/editor/CodeBlockView.vue'
import DatabaseView from '~/components/editor/DatabaseView.vue'
import BookmarkView from '~/components/editor/BookmarkView.vue'
import { Bookmark } from '~/editor/bookmark'
import { Callout, type CalloutType } from '~/editor/callout'
import { Database } from '~/editor/database'
import { createExtensions, markdownOptions, starterKitOptions } from '~/editor/extensions'
import { wikiLinkStatusKey, type WikiLinkAttributes } from '~/editor/wiki-link'
import { currentHeading, scrollParent } from '~/utils/current-heading'
import { filesPrefix, normalizeMarkdown } from '~/utils/markdown-paths'

const props = defineProps<{
  /** Initial content, in editor form (see markdown-paths). */
  content: string
  noteId: string
  notePath: string
  /** Shown, not edited (Markdown it can't show: see markdown-loss). */
  readOnly?: boolean
}>()

const emit = defineEmits<{
  change: [markdown: string]
  headings: [headings: Heading[]]
  /** The heading the reader is in, as an index in `headings` (-1 before the first one). */
  activeHeading: [index: number]
}>()

export interface Heading {
  level: number
  text: string
  pos: number
}

const api = useApi()
const tree = useTree()
const toast = useToast()
const showError = useApiErrorToast()
const editorRef = useTemplateRef<{ editor: Editor | undefined }>('editorRef')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
// UEditor reads `editable` once, at its start: later changes go to the editor itself.
watch(
  () => props.readOnly,
  (readOnly) => editorRef.value?.editor?.setEditable(!readOnly),
)

// --- Extensions ----------------------------------------------------------------------------

// Read on each redraw (a function): a page turning into a folder (or back) changes it. One
// object for the editor's lifetime: a new one per render would reconfigure the editor each time.
const placeholder = {
  placeholder: () =>
    isFolder.value
      ? 'Write here to turn this folder into a note.'
      : 'Type / for commands, [[ to link a note…',
  mode: 'firstLine' as const,
}
// The page shows as a folder (no content, child pages): its placeholder says so.
const isFolder = computed(() => {
  const node = tree.byId.value.get(props.noteId)
  return !!node && tree.kindOf(node) === 'folder'
})
// Redrawn when the folder state changes without an edit (the save made it a folder).
watch(isFolder, () => {
  const editor = editorRef.value?.editor
  if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr)
})

/** The page a wiki link points to: by path first, then by title (as the server resolves it). */
function linkedPage(target: string) {
  const key = linkKey(target)
  // Folders too: pages without content.
  const pages = tree.nodes.value
  return (
    pages.find((n) => linkKey(n.path) === key) ??
    pages
      .filter((n) => linkKey(n.title) === key)
      .toSorted((a, b) => a.path.length - b.path.length)[0]
  )
}

function openWikiLink(attributes: WikiLinkAttributes) {
  const match = linkedPage(attributes.target)
  if (match) {
    void navigateTo(`/notes/${match.id}`)
    return
  }
  toast.add({
    title: `“${attributes.target}” doesn't exist yet`,
    icon: 'i-lucide-file-question',
    actions: [
      {
        label: 'Create it',
        icon: 'i-lucide-file-plus',
        onClick: () =>
          void tree.createPage(null, attributes.target.split('/').pop() ?? attributes.target),
      },
    ],
  })
}

// A note created, renamed or deleted can change which links point to an existing note.
watch(
  () => tree.nodes.value,
  () => {
    const editor = editorRef.value?.editor
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(wikiLinkStatusKey, true))
  },
)

const markdownParser = markdownOptions()
const extensions = createExtensions({
  onOpenWikiLink: openWikiLink,
  wikiLinkExists: (target) => !!linkedPage(target),
  onFiles: (editor, files, pos) => void uploadFiles(editor, files, pos),
}).map((extension) => {
  if (extension.name === CodeBlockLowlight.name) {
    return (extension as typeof CodeBlockLowlight).extend({
      addNodeView: () => VueNodeViewRenderer(CodeBlockView),
    })
  }
  if (extension.name === Callout.name) {
    return Callout.extend({ addNodeView: () => VueNodeViewRenderer(CalloutView) })
  }
  if (extension.name === Database.name) {
    return Database.extend({ addNodeView: () => VueNodeViewRenderer(DatabaseView) })
  }
  if (extension.name === Bookmark.name) {
    return Bookmark.extend({ addNodeView: () => VueNodeViewRenderer(BookmarkView) })
  }
  return extension
})

// --- Uploads -------------------------------------------------------------------------------

const LARGE_FILE = 10 * 1024 * 1024
const largeFiles = ref<File[]>([])
let confirmLarge: ((ok: boolean) => void) | null = null

function askLarge(files: File[]): Promise<boolean> {
  largeFiles.value = files
  return new Promise((resolve) => (confirmLarge = resolve))
}

function answerLarge(ok: boolean) {
  largeFiles.value = []
  confirmLarge?.(ok)
  confirmLarge = null
}

async function uploadFiles(editor: CoreEditor, files: File[], pos: number | null) {
  if (!files.length) return
  const large = files.filter((file) => file.size > LARGE_FILE)
  if (large.length && !(await askLarge(large))) return
  const uploading = toast.add({
    title: files.length === 1 ? `Uploading ${files[0]!.name}…` : `Uploading ${files.length} files…`,
    icon: 'i-lucide-loader-circle',
    duration: 0,
  })
  const content = []
  try {
    for (const file of files) {
      const attachment = await unwrap(
        api.notes[':id'].attachments.$post({ param: { id: props.noteId }, form: { file } }),
      )
      const src = `${filesPrefix(props.notePath)}${attachment.markdownPath}`
      if (attachment.isImage) content.push({ type: 'image', attrs: { src, alt: attachment.name } })
      else {
        content.push(
          { type: 'text', text: attachment.name, marks: [{ type: 'link', attrs: { href: src } }] },
          { type: 'text', text: ' ' },
        )
      }
    }
    const at = pos ?? editor.state.selection.from
    editor.chain().focus().insertContentAt(at, content).run()
  } catch (error) {
    showError(error, 'Upload failed')
  } finally {
    toast.remove(uploading.id)
  }
}

/** A new database for this note, its block where the cursor was (taken before the request). */
async function insertDatabase(editor: CoreEditor) {
  const at = editor.state.selection.from
  try {
    const database = await unwrap(
      api.notes[':id'].databases.$post({ param: { id: props.noteId }, json: {} }),
    )
    // Then a line after it, the cursor there (ready to go on writing).
    editor
      .chain()
      .insertContentAt(Math.min(at, editor.state.doc.content.size), [
        { type: 'database', attrs: { id: database.id } },
        { type: 'paragraph' },
      ])
      .focus()
      .run()
  } catch (error) {
    showError(error, 'Could not create the database')
  }
}

/** A bookmark's card where the cursor was (taken before the picker opens). */
const bookmarkActions = useBookmarkActions()
async function insertBookmark(editor: CoreEditor) {
  const at = editor.state.selection.from
  const id = await bookmarkActions.pick()
  if (!id) return
  editor
    .chain()
    .insertContentAt(Math.min(at, editor.state.doc.content.size), [
      { type: 'bookmark', attrs: { id } },
      { type: 'paragraph' },
    ])
    .focus()
    .run()
}

function pickFiles() {
  fileInput.value?.click()
}

function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const editor = editorRef.value?.editor
  if (editor && input.files?.length) void uploadFiles(editor, [...input.files], null)
  input.value = ''
}

// --- Menus ---------------------------------------------------------------------------------

type TableAction =
  | 'addRowAfter'
  | 'addColumnAfter'
  | 'deleteRow'
  | 'deleteColumn'
  | 'toggleHeaderRow'
  | 'deleteTable'

/** One handler per table command (toolbar items can't carry arguments). */
function tableHandlers() {
  const actions: TableAction[] = [
    'addRowAfter',
    'addColumnAfter',
    'deleteRow',
    'deleteColumn',
    'toggleHeaderRow',
    'deleteTable',
  ]
  return Object.fromEntries(
    actions.map((action) => [
      action,
      {
        canExecute: (editor: Editor) => editor.isActive('table'),
        execute: (editor: Editor) => editor.chain().focus()[action](),
        isActive: () => false,
      },
    ]),
  ) as Record<
    TableAction,
    {
      canExecute: (editor: Editor) => boolean
      execute: (editor: Editor) => ReturnType<Editor['chain']>
      isActive: () => boolean
    }
  >
}

/**
 * Lists from the slash menu and the toolbar: TipTap's toggles, as ⌘⇧7/8/9 and typed markers.
 * They change the kind of the level the cursor is in (each level has one, any kind at any
 * level), or remove the list at that kind. Nuxt UI's own lifted the item out of its list first,
 * and lost its text inside a list.
 */
function listHandlers() {
  const toggles = {
    bulletList: 'toggleBulletList',
    orderedList: 'toggleOrderedList',
    taskList: 'toggleTaskList',
  } as const
  /** The kind of the level the cursor is in. */
  const level = (editor: Editor) => {
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      const name = $from.node(depth).type.name
      if (name in toggles) return name
    }
    return null
  }
  return Object.fromEntries(
    Object.entries(toggles).map(([kind, toggle]) => [
      kind,
      {
        canExecute: (editor: Editor) => editor.can()[toggle](),
        execute: (editor: Editor) => editor.chain().focus()[toggle](),
        isActive: (editor: Editor) => level(editor) === kind,
      },
    ]),
  ) as Record<
    keyof typeof toggles,
    {
      canExecute: (editor: Editor) => boolean
      execute: (editor: Editor) => ReturnType<Editor['chain']>
      isActive: (editor: Editor) => boolean
    }
  >
}

const handlers = {
  ...listHandlers(),
  callout: {
    canExecute: (editor: Editor) => editor.can().setCallout(),
    execute: (editor: Editor, item: { calloutType?: CalloutType }) =>
      editor.chain().focus().setCallout(item.calloutType),
    isActive: (editor: Editor) => editor.isActive('callout'),
  },
  details: {
    canExecute: (editor: Editor) => editor.can().setDetails(),
    execute: (editor: Editor) => editor.chain().focus().setDetails(),
    isActive: (editor: Editor) => editor.isActive('details'),
  },
  table: {
    canExecute: (editor: Editor) =>
      editor.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    execute: (editor: Editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    isActive: (editor: Editor) => editor.isActive('table'),
  },
  database: {
    canExecute: () => true,
    execute: (editor: Editor) => {
      void insertDatabase(editor)
      return editor.chain()
    },
    isActive: () => false,
  },
  bookmark: {
    canExecute: () => true,
    execute: (editor: Editor) => {
      void insertBookmark(editor)
      return editor.chain()
    },
    isActive: () => false,
  },
  mermaid: {
    canExecute: () => true,
    execute: (editor: Editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [{ type: 'text', text: 'flowchart LR\n  A[Idea] --> B[Note] --> C[Done]' }],
        }),
    isActive: () => false,
  },
  upload: {
    canExecute: () => true,
    execute: (editor: Editor) => {
      pickFiles()
      return editor.chain()
    },
    isActive: () => false,
  },
  wikiLink: {
    canExecute: () => true,
    execute: (editor: Editor, item: { target?: string }) =>
      editor
        .chain()
        .focus()
        .insertContent([
          { type: 'wikiLink', attrs: { target: item.target } },
          { type: 'text', text: ' ' },
        ]),
    isActive: () => false,
  },
  startWikiLink: {
    canExecute: () => true,
    execute: (editor: Editor) => editor.chain().focus().insertContent('[['),
    isActive: () => false,
  },
  ...tableHandlers(),
} satisfies EditorCustomHandlers

type Handlers = typeof handlers

// Bookmarks only when they're on (Settings › Features); cards already in notes still show.
const { settings } = useSettings()
const slashItems = computed<EditorSuggestionMenuItem<Handlers>[][]>(() => [
  [
    { type: 'label', label: 'Text' },
    { kind: 'paragraph', label: 'Paragraph', icon: 'i-lucide-type' },
    { kind: 'heading', level: 1, label: 'Heading 1', icon: 'i-lucide-heading-1' },
    { kind: 'heading', level: 2, label: 'Heading 2', icon: 'i-lucide-heading-2' },
    { kind: 'heading', level: 3, label: 'Heading 3', icon: 'i-lucide-heading-3' },
    { kind: 'bulletList', label: 'Bullet list', icon: 'i-lucide-list' },
    { kind: 'orderedList', label: 'Numbered list', icon: 'i-lucide-list-ordered' },
    { kind: 'taskList', label: 'To-do list', icon: 'i-lucide-list-checks' },
    { kind: 'blockquote', label: 'Quote', icon: 'i-lucide-text-quote' },
  ],
  [
    { type: 'label', label: 'Blocks' },
    { kind: 'codeBlock', label: 'Code block', icon: 'i-lucide-square-code' },
    { kind: 'table', label: 'Table', icon: 'i-lucide-table' },
    {
      kind: 'database',
      label: 'Database',
      description: 'Rows you can sort and filter',
      icon: 'i-lucide-database',
    },
    ...(settings.value.bookmarks
      ? [
          {
            kind: 'bookmark' as const,
            label: 'Bookmark',
            description: 'A website’s card, from your bookmarks',
            icon: 'i-lucide-bookmark',
          },
        ]
      : []),
    { kind: 'callout', calloutType: 'note', label: 'Callout: note', icon: 'i-lucide-info' },
    { kind: 'callout', calloutType: 'tip', label: 'Callout: tip', icon: 'i-lucide-lightbulb' },
    {
      kind: 'callout',
      calloutType: 'warning',
      label: 'Callout: warning',
      icon: 'i-lucide-triangle-alert',
    },
    { kind: 'details', label: 'Collapsible section', icon: 'i-lucide-list-collapse' },
    { kind: 'mermaid', label: 'Diagram (Mermaid)', icon: 'i-lucide-workflow' },
    { kind: 'horizontalRule', label: 'Divider', icon: 'i-lucide-separator-horizontal' },
  ],
  [
    { type: 'label', label: 'Insert' },
    {
      kind: 'startWikiLink',
      label: 'Link to a note',
      description: 'Or type [[',
      icon: 'i-lucide-file-symlink',
    },
    {
      kind: 'upload',
      label: 'Image or file',
      description: 'Or drop it anywhere',
      icon: 'i-lucide-paperclip',
    },
  ],
])

const toolbarItems: EditorToolbarItem<Handlers>[][] = [
  [
    {
      label: 'Turn into',
      trailingIcon: 'i-lucide-chevron-down',
      activeColor: 'neutral',
      activeVariant: 'ghost',
      tooltip: { text: 'Turn into' },
      content: { align: 'start' },
      ui: { label: 'text-xs' },
      items: [
        { type: 'label', label: 'Turn into' },
        { kind: 'paragraph', label: 'Paragraph', icon: 'i-lucide-type' },
        { kind: 'heading', level: 1, label: 'Heading 1', icon: 'i-lucide-heading-1' },
        { kind: 'heading', level: 2, label: 'Heading 2', icon: 'i-lucide-heading-2' },
        { kind: 'heading', level: 3, label: 'Heading 3', icon: 'i-lucide-heading-3' },
        { kind: 'bulletList', label: 'Bullet list', icon: 'i-lucide-list' },
        { kind: 'orderedList', label: 'Numbered list', icon: 'i-lucide-list-ordered' },
        { kind: 'taskList', label: 'To-do list', icon: 'i-lucide-list-checks' },
        { kind: 'blockquote', label: 'Quote', icon: 'i-lucide-text-quote' },
        { kind: 'codeBlock', label: 'Code block', icon: 'i-lucide-square-code' },
      ],
    },
  ],
  [
    {
      kind: 'mark',
      mark: 'bold',
      icon: 'i-lucide-bold',
      tooltip: { text: 'Bold', kbds: ['meta', 'b'] },
    },
    {
      kind: 'mark',
      mark: 'italic',
      icon: 'i-lucide-italic',
      tooltip: { text: 'Italic', kbds: ['meta', 'i'] },
    },
    {
      kind: 'mark',
      mark: 'strike',
      icon: 'i-lucide-strikethrough',
      tooltip: { text: 'Strikethrough' },
    },
    {
      kind: 'mark',
      mark: 'code',
      icon: 'i-lucide-code',
      tooltip: { text: 'Code', kbds: ['meta', 'e'] },
    },
  ],
  [{ slot: 'link', icon: 'i-lucide-link', tooltip: { text: 'Link' } }],
]

const tableItems: EditorToolbarItem<Handlers>[][] = [
  [
    {
      kind: 'addRowAfter',
      icon: 'i-lucide-between-horizontal-end',
      tooltip: { text: 'Add row' },
    },
    {
      kind: 'addColumnAfter',
      icon: 'i-lucide-between-vertical-end',
      tooltip: { text: 'Add column' },
    },
    {
      kind: 'toggleHeaderRow',
      icon: 'i-lucide-heading',
      tooltip: { text: 'Toggle header row' },
    },
  ],
  [
    {
      kind: 'deleteRow',
      icon: 'i-lucide-rows-3',
      tooltip: { text: 'Delete row' },
    },
    {
      kind: 'deleteColumn',
      icon: 'i-lucide-columns-3',
      tooltip: { text: 'Delete column' },
    },
    {
      kind: 'deleteTable',
      icon: 'i-lucide-trash-2',
      color: 'error',
      tooltip: { text: 'Delete table' },
    },
  ],
]

const wikiItems = computed<EditorSuggestionMenuItem<Handlers>[]>(() => {
  const pages = tree.nodes.value.filter((n) => n.id !== props.noteId)
  const titleCounts = new Map<string, number>()
  for (const page of pages)
    titleCounts.set(linkKey(page.title), (titleCounts.get(linkKey(page.title)) ?? 0) + 1)
  return pages.map((page: TreeNode) => ({
    kind: 'wikiLink',
    label: page.title,
    description: page.path.replace(/\.md$/, ''),
    icon: 'i-lucide-file-text',
    target:
      (titleCounts.get(linkKey(page.title)) ?? 0) > 1 ? page.path.replace(/\.md$/, '') : page.title,
  }))
})

// --- Link popover ----------------------------------------------------------------------------

const linkUrl = ref('')
const linkOpen = ref(false)

function openLink(editor: Editor) {
  linkUrl.value = (editor.getAttributes('link').href as string | undefined) ?? ''
  linkOpen.value = true
}

function applyLink(editor: Editor) {
  const href = linkUrl.value.trim()
  const chain = editor.chain().focus().extendMarkRange('link')
  if (href)
    chain
      .setLink({ href: /^[a-z][a-z0-9+.-]*:|^\/|^#/i.test(href) ? href : `https://${href}` })
      .run()
  else chain.unsetLink().run()
  linkOpen.value = false
}

function removeLink(editor: Editor) {
  linkUrl.value = ''
  applyLink(editor)
}

// --- Content -----------------------------------------------------------------------------------

function collectHeadings(editor: Editor) {
  const headings: Heading[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading')
      headings.push({ level: node.attrs.level as number, text: node.textContent, pos })
    return node.type.name !== 'heading'
  })
  // A heading added or removed shifts the others: the pinned one may not be the same anymore.
  if (headings.length !== headingPositions.length) pinned = -1
  headingPositions = headings.map((heading) => heading.pos)
  emit('headings', headings)
  scheduleActiveHeading()
}

// --- Current heading (highlighted in the Headings panel) -------------------------------------------------

let headingPositions: number[] = []
/** The note's scrolling area (the page panel's body), found on mount. */
let scroller: HTMLElement | null = null
/** The heading chosen in the outline: it stays current until the reader scrolls. */
let pinned = -1
/** While a jump from the Headings panel scrolls (smoothly), its scroll events don't unpin. */
let jumping: ReturnType<typeof setTimeout> | undefined
let reportedActive = -2
let frame = 0

function reportActiveHeading(index: number) {
  if (index === reportedActive) return
  reportedActive = index
  emit('activeHeading', index)
}

function measureActiveHeading() {
  frame = 0
  const editor = editorRef.value?.editor
  if (!editor || editor.isDestroyed || !scroller) return
  if (pinned >= 0) {
    reportActiveHeading(pinned)
    return
  }
  // A heading that isn't laid out (none should be) takes the previous one's place.
  let previous = Number.NEGATIVE_INFINITY
  const tops = headingPositions.map((pos) => {
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement && dom.getClientRects().length)
      previous = Math.max(previous, dom.getBoundingClientRect().top)
    return previous
  })
  reportActiveHeading(
    currentHeading(tops, {
      top: scroller.getBoundingClientRect().top,
      height: scroller.clientHeight,
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
    }),
  )
}

function scheduleActiveHeading() {
  if (!frame) frame = requestAnimationFrame(measureActiveHeading)
}

function endJump() {
  jumping = undefined
}

function onScroll() {
  if (jumping) {
    clearTimeout(jumping)
    jumping = setTimeout(endJump, 150)
    return
  }
  pinned = -1
  scheduleActiveHeading()
}

/** Pins a heading chosen in the Headings panel (see `pinned`). */
function pinHeading(pos: number) {
  const index = headingPositions.indexOf(pos)
  if (index < 0) return
  pinned = index
  reportActiveHeading(index)
  clearTimeout(jumping)
  jumping = setTimeout(endJump, 300)
}

// Content that changes height (images loading, a resized window) moves the headings.
let resizes: ResizeObserver | undefined

// From this component's root: TipTap puts its view in the page only after the next tick.
const root = useTemplateRef<HTMLElement>('root')
onMounted(() => {
  scroller = root.value ? scrollParent(root.value) : null
  if (!root.value || !scroller) return
  scroller.addEventListener('scroll', onScroll, { passive: true })
  resizes = new ResizeObserver(scheduleActiveHeading)
  resizes.observe(scroller)
  resizes.observe(root.value)
})

onBeforeUnmount(() => {
  stopFollowing?.()
  scroller?.removeEventListener('scroll', onScroll)
  resizes?.disconnect()
  cancelAnimationFrame(frame)
  clearTimeout(jumping)
  // Other modes (Markdown, authorship) don't follow the reading position.
  emit('activeHeading', -1)
})

/**
 * The Markdown last reported (or loaded), tidied. The editor normalizes some Markdown when it
 * loads a note (table padding, escapes), and extensions adjust the document later (an empty
 * paragraph after a final list, on the first transaction): those change nothing the user did,
 * so they must not save the note (and take its authorship). Only a different Markdown is a
 * change; blank lines don't count (they are tidied on save anyway).
 */
let reported: string | null = null

function onUpdate(value: unknown) {
  const markdown = String(value)
  const editor = editorRef.value?.editor
  if (editor) collectHeadings(editor)
  const tidy = normalizeMarkdown(markdown)
  if (tidy === reported) return
  reported = tidy
  emit('change', markdown)
}

// The block under the drag handle (its `hover` event comes just before it is positioned).
let handlePos = -1
function onHandleHover({ pos }: { pos: number }) {
  handlePos = pos
}

/**
 * How far left of its block the drag handle goes: 8px, plus, for bullet and numbered items, the
 * margin where their marker is drawn (outside the item), so that the handle doesn't cover it.
 * Task items keep the plain distance: their checkbox is inside the item. (TipTap's Vue handle
 * doesn't pass a custom reference element through, but Floating UI's offset does.)
 */
function markerGutter(): number {
  const editor = editorRef.value?.editor
  if (!editor || handlePos < 0) return 0
  if (editor.state.doc.nodeAt(handlePos)?.type.name !== 'listItem') return 0
  const item = editor.view.nodeDOM(handlePos)
  const list = item instanceof HTMLElement ? item.parentElement : null
  if (!(item instanceof HTMLElement) || !list) return 0
  return Math.max(0, item.getBoundingClientRect().left - list.getBoundingClientRect().left)
}

const handleOptions = {
  offset: ({
    rects,
  }: {
    rects: { reference: { height: number }; floating: { height: number } }
  }) => ({
    mainAxis: 8 + markerGutter(),
    // As Nuxt UI does: centered on a one-line block, at the top of a taller one.
    alignmentAxis:
      rects.reference.height > 40 ? 0 : (rects.reference.height - rects.floating.height) / 2,
  }),
}

// The `:` menu's list (about 800 KB) loads after the note shows, not with it.
const emojis = shallowRef<EmojiItem[]>([])
onMounted(() => {
  void import('@tiptap/extension-emoji').then((module) => (emojis.value = module.gitHubEmojis))
})

onMounted(() => {
  const editor = editorRef.value?.editor
  if (!editor) return
  reported = normalizeMarkdown(editor.getMarkdown())
  collectHeadings(editor)
  followHistory(editor)
})

// --- Undo ------------------------------------------------------------------------------------

const undoHistory = useUndo()
let stopFollowing: (() => void) | undefined

/**
 * The editor's undo steps take their place in the app's history (useUndo), which ⌘Z and ⌘⇧Z
 * go through: each new step of its own history (a group of changes) is recorded there, and
 * undone or redone by it. A step recorded elsewhere (a database change) closes the editor's
 * current group: typing after it is a step of its own, undone before it.
 */
function followHistory(editor: Editor) {
  let depth = undoDepth(editor.state)
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    const next = undoDepth(editor.state)
    // Only a change of the document is a step (the depth can also move with no change: the
    // editor's state reconfigured as it starts).
    if (next > depth && transaction.docChanged && !undoHistory.isReplaying()) {
      undoHistory.record({
        label: 'Typing',
        noteId: props.noteId,
        editor,
        undo: () => editor.chain().focus().undo().run(),
        redo: () => editor.chain().focus().redo().run(),
      })
    }
    depth = next
  }
  editor.on('transaction', onTransaction)
  const stopListening = undoHistory.onRecord((step) => {
    if (step.editor !== editor && !editor.isDestroyed) {
      editor.view.dispatch(closeHistory(editor.state.tr))
    }
  })
  stopFollowing = () => {
    editor.off('transaction', onTransaction)
    stopListening()
    undoHistory.forget(editor)
  }
}

defineExpose({
  /** The TipTap editor (for the find bar). */
  editor: computed(() => editorRef.value?.editor),
  /** Replaces the content (an external change), keeping the cursor where it can. */
  setContent(markdown: string) {
    const editor = editorRef.value?.editor
    if (!editor) return
    const { from } = editor.state.selection
    editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
    reported = normalizeMarkdown(editor.getMarkdown())
    editor.commands.setTextSelection(Math.min(from, editor.state.doc.content.size))
    collectHeadings(editor)
  },
  scrollTo(pos: number) {
    const editor = editorRef.value?.editor
    if (!editor) return
    pinHeading(pos)
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Without TipTap's own scroll to the cursor: one frame later, instant, it would cut the
    // smooth scroll short (no animation, and the heading left wherever the cursor showed).
    editor
      .chain()
      .focus(null, { scrollIntoView: false })
      .setTextSelection(pos + 1)
      .run()
  },
  focus(position: 'start' | 'end' = 'start') {
    editorRef.value?.editor?.commands.focus(position)
  },
  /** Goes to a TODO picked on the TODOs page (see editor/todos.ts). */
  revealTodo(index: number, text?: string) {
    editorRef.value?.editor
      ?.chain()
      .focus(null, { scrollIntoView: false })
      .revealTodo(index, text)
      .run()
  },
})
</script>

<template>
  <div ref="root" class="note-editor" :class="isFolder && 'note-editor--folder'">
    <UEditor
      ref="editorRef"
      v-slot="{ editor }"
      :model-value="content"
      :editable="!readOnly"
      content-type="markdown"
      :markdown="markdownParser"
      :starter-kit="starterKitOptions"
      :image="false"
      :mention="false"
      :extensions="extensions"
      :handlers="handlers"
      :placeholder="placeholder"
      class="w-full"
      :ui="{ base: '*:my-4 sm:px-0' }"
      @update:model-value="onUpdate"
    >
      <UEditorToolbar
        :editor="editor"
        :items="toolbarItems"
        layout="bubble"
        plugin-key="selectionToolbar"
        :should-show="
          ({ editor: e, view, state }: any) =>
            !e.isActive('codeBlock') &&
            !e.isActive('image') &&
            !e.isActive('database') &&
            !e.isActive('bookmark') &&
            view.hasFocus() &&
            !state.selection.empty
        "
      >
        <template #link>
          <UPopover v-model:open="linkOpen" :content="{ side: 'bottom', align: 'start' }">
            <UButton
              icon="i-lucide-link"
              color="neutral"
              :variant="editor.isActive('link') ? 'soft' : 'ghost'"
              size="sm"
              aria-label="Link"
              @click="openLink(editor)"
            />
            <template #content>
              <form class="flex items-center gap-1 p-1" @submit.prevent="applyLink(editor)">
                <UInput
                  v-model="linkUrl"
                  placeholder="Paste a link…"
                  size="sm"
                  autofocus
                  class="w-64"
                  variant="none"
                />
                <UButton
                  type="submit"
                  icon="i-lucide-corner-down-left"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  aria-label="Apply"
                />
                <UButton
                  v-if="editor.isActive('link')"
                  icon="i-lucide-unlink"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  aria-label="Remove link"
                  @click="removeLink(editor)"
                />
              </form>
            </template>
          </UPopover>
        </template>
      </UEditorToolbar>

      <UEditorToolbar
        :editor="editor"
        :items="tableItems"
        layout="bubble"
        plugin-key="tableToolbar"
        :should-show="({ editor: e, view }: any) => e.isActive('table') && view.hasFocus()"
        :options="{ placement: 'top-start' }"
      />

      <UEditorSuggestionMenu :editor="editor" :items="slashItems" />
      <UEditorSuggestionMenu
        :editor="editor"
        :items="wikiItems"
        char="[["
        plugin-key="wikiLinkMenu"
        :suggestion="{ allowSpaces: true }"
        :filter-fields="['label', 'description']"
        :limit="10"
      />
      <UEditorEmojiMenu :editor="editor" :items="emojis" />
      <!-- Nested: list items get their own handle (one item moves, not the whole list). No edge
           detection: it would pick the whole list as the pointer crosses the item's left edge,
           on its way to the handle. -->
      <UEditorDragHandle
        :editor="editor"
        :nested="{ edgeDetection: 'none' }"
        :options="handleOptions"
        @hover="onHandleHover"
      />
    </UEditor>

    <input ref="fileInput" type="file" multiple class="hidden" @change="onFilesPicked" />

    <UModal
      :open="largeFiles.length > 0"
      title="Large file"
      :description="`${largeFiles.map((f) => f.name).join(', ')} ${largeFiles.length > 1 ? 'are' : 'is'} over 10 MB. Large files make your data folder (and its sync) heavier.`"
      @update:open="(open) => !open && answerLarge(false)"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="answerLarge(false)" />
          <UButton label="Attach anyway" icon="i-lucide-paperclip" @click="answerLarge(true)" />
        </div>
      </template>
    </UModal>
  </div>
</template>
