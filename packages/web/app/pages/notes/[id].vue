<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem } from '@nuxt/ui'
import { useLocalStorage, watchDebounced } from '@vueuse/core'
import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import {
  OWNER,
  authorLabel,
  calendarDateOf,
  dayLabel,
  formatDateTime,
  isoDate,
} from '@tandem/shared'
import type { Heading } from '~/components/NoteEditor.vue'
import { DELETE_FOREVER } from '~/composables/useTree'
import { lostLines, markdownLosses, type Loss } from '~/utils/markdown-loss'
import { fromEditorMarkdown, normalizeMarkdown, toEditorMarkdown } from '~/utils/markdown-paths'

definePageMeta({ key: (route) => String(route.params.id) })

const route = useRoute()
const router = useRouter()
const tree = useTree()
const toast = useToast()
const api = useApi()
const showError = useApiErrorToast()
const { settings } = useSettings()

const id = computed(() => String(route.params.id))
const doc = useNoteDocument(id)
// Shown at the bottom of the sidebar, next to the version (default.vue).
const openNoteSave = useOpenNoteSave()
watchEffect(() => {
  openNoteSave.value = { status: doc.status.value, savedAt: doc.savedAt.value }
})
onBeforeUnmount(() => (openNoteSave.value = null))
await doc.load()

const node = computed(() => tree.byId.value.get(id.value) ?? doc.note.value?.node ?? null)
const notePath = computed(() => node.value?.path ?? doc.note.value?.node.path ?? '')

// --- A daily note (daily notes on): its day is its title, and ‹ › lead to the days around ---

const calendarDate = computed(() => (settings.value.daily ? calendarDateOf(notePath.value) : null))
const today = ref(isoDate())
const dayTitle = computed(() =>
  calendarDate.value ? dayLabel(calendarDate.value, today.value).title : '',
)
const daily = useDaily()
function goToDay(days: number) {
  void daily.step(days)
}
// Left empty (opened, nothing written), the day's note goes: a day with nothing has no file.
// The server checks it is still empty, and has no history.
const noteId = id.value
onBeforeUnmount(() => {
  if (!calendarDate.value || content.value.trim()) return
  void doc
    .flush()
    .then(() => api.calendar[':id'].$delete({ param: { id: noteId } }))
    .catch(() => {})
})

useHead({ title: () => dayTitle.value || node.value?.title || 'Untitled' })

// --- Content and modes ---------------------------------------------------------------------

type Mode = 'edit' | 'source' | 'authorship'
const mode = ref<Mode>('edit')
/** Latest content in file form, whatever the mode. */
const content = ref(doc.note.value?.content ?? '')
const editorContent = ref(toEditorMarkdown(content.value, notePath.value))
const editorKey = ref(0)
const editor = useTemplateRef<{
  editor: TiptapEditor | undefined
  setContent(markdown: string): void
  scrollTo(pos: number): void
  focus(position?: 'start' | 'end'): void
  revealTodo(index: number, text?: string): void
}>('editor')

// --- Find in the note (⌘F, ⌘⌥F with replace) ---------------------------------------------------

const findOpen = ref(false)
const findReplacing = ref(false)
const findInitial = ref('')
const findBar = useTemplateRef<{ focus(text?: string): void }>('findBar')

function openFind(replace: boolean) {
  const tiptap = editor.value?.editor
  if (!tiptap) return
  // The selected text (on one line) is what to find, as in VS Code.
  const { from, to } = tiptap.state.selection
  const selected = tiptap.state.doc.textBetween(from, to, '\n')
  const text = selected && !selected.includes('\n') ? selected : ''
  if (replace) findReplacing.value = true
  if (findOpen.value) {
    findBar.value?.focus(text || undefined)
    return
  }
  findInitial.value = text
  findOpen.value = true
}

// Only in edit mode: elsewhere (Markdown source), the browser's own find works.
defineShortcuts(
  computed(() =>
    mode.value === 'edit'
      ? {
          meta_f: { usingInput: true, handler: () => openFind(false) },
          meta_alt_f: { usingInput: true, handler: () => openFind(true) },
        }
      : {},
  ),
)
function closeFind() {
  findOpen.value = false
  findReplacing.value = false
}
watch(mode, closeFind)
const headings = ref<Heading[]>([])
/** The heading the reader is in (an index in `headings`), highlighted in the Headings panel. */
const activeHeading = ref(-1)

function resetEditor(markdown: string) {
  content.value = markdown
  checkLosses()
  editorContent.value = toEditorMarkdown(markdown, notePath.value)
  editorKey.value++
}

// Editing a note in the preview tab keeps it open, as in VS Code: a change waiting to be
// saved (not opening it, which changes nothing), or a new title.
const tabs = useTabs()
watch(
  () => doc.status.value,
  (status) => {
    if (status === 'pending') tabs.keepOpen(`note:${id.value}`)
  },
)

function onEditorChange(markdown: string) {
  content.value = normalizeMarkdown(fromEditorMarkdown(markdown, notePath.value))
  // The editor's own Markdown: nothing in it the editor can't show.
  losses.value = []
  doc.change(content.value)
}

// --- Markdown the editor can't show ----------------------------------------------------------
// (HTML comments, raw HTML: see markdown-loss.) It would go at the first edit in the editor:
// the Markdown view says so and won't switch to the editor, and the editor opens read-only,
// unless the owner accepts the loss for this content ("Edit anyway").

const losses = ref<Loss[]>([])
const acceptedLoss = ref<string | null>(null)
const lossBlocks = computed(() => losses.value.length > 0 && acceptedLoss.value !== content.value)
const lossSummary = computed(() =>
  losses.value
    .slice(0, 3)
    .map((loss) => `line ${loss.line} (${loss.what})`)
    .join(', ')
    .concat(losses.value.length > 3 ? `, and ${losses.value.length - 3} more` : ''),
)

function checkLosses() {
  losses.value = markdownLosses(content.value, notePath.value)
}
// On opening, the editor's own first reading of the note tells, as soon as it exists (before
// any typing): a second, hidden editor would parse the note twice (200 ms on a long note).
let checkedOnOpen = false
watch(
  () => editor.value?.editor,
  (tiptap) => {
    if (!tiptap || checkedOnOpen) return
    checkedOnOpen = true
    const read = normalizeMarkdown(fromEditorMarkdown(tiptap.getMarkdown(), notePath.value))
    losses.value = lostLines(content.value, read)
  },
  { immediate: true },
)
watchDebounced(content, () => mode.value === 'source' && checkLosses(), { debounce: 400 })

function acceptLoss() {
  acceptedLoss.value = content.value
}

const source = useTemplateRef<{ goToLine(line: number): void }>('source')

/** Shows a line in the Markdown view (from a loss message). */
async function goToLine(line: number) {
  setMode('source')
  await nextTick()
  source.value?.goToLine(line)
}

function openAnyway() {
  acceptLoss()
  setMode('edit')
}

/** Switches the view; from the Markdown view, not to the editor while it would lose some. */
function setMode(next: Mode) {
  if (mode.value === 'source' && next === 'edit') {
    checkLosses()
    if (lossBlocks.value) {
      toast.add({
        title: "The editor can't show all of this Markdown",
        description: `Fix ${lossSummary.value}, or open the editor anyway.`,
        color: 'error',
        icon: 'i-lucide-triangle-alert',
      })
      return
    }
  }
  mode.value = next
}

function appendMarkdown(markdown: string) {
  const next = `${content.value.replace(/\n*$/, content.value ? '\n\n' : '')}${markdown}\n`
  resetEditor(next)
  doc.change(next)
}

function onSourceChange(value: string) {
  content.value = value
  doc.change(value)
}

watch(mode, (next, previous) => {
  if (previous === 'source' && next === 'edit') resetEditor(content.value)
})

// --- Title -----------------------------------------------------------------------------------

const titleDraft = ref(node.value?.title ?? '')
const titleInput = useTemplateRef<{ inputRef: HTMLInputElement }>('titleInput')
watch(
  () => node.value?.title,
  (title) => {
    if (title !== undefined && document.activeElement !== titleInput.value?.inputRef)
      titleDraft.value = title
  },
)

async function commitTitle() {
  const title = titleDraft.value.trim()
  if (!node.value || !title || title === node.value.title) {
    titleDraft.value = node.value?.title ?? ''
    return
  }
  await doc.flush()
  tabs.keepOpen(`note:${node.value.id}`)
  const renamed = await tree.rename(node.value.id, title)
  titleDraft.value = renamed?.title ?? node.value.title
}

function titleEnter() {
  titleInput.value?.inputRef.blur()
  editor.value?.focus('start')
}

// The note moved or was renamed (its path changed). Attachment links are relative to the note
// (the server rewrote them in the file), and the editor shows them as /files/<path> URLs: when
// the note has some, reload it in place. Otherwise nothing changes, and typing goes on.
watch(
  () => node.value?.path,
  async (path, previous) => {
    if (!path || !previous || path === previous) return
    await doc.flush()
    if (!content.value.includes('.assets/')) return
    await doc.load()
    if (!doc.note.value) return
    content.value = doc.note.value.content
    editorContent.value = toEditorMarkdown(content.value, path)
    editor.value?.setContent(editorContent.value)
  },
)

onMounted(() => {
  if (route.query.new) {
    titleInput.value?.inputRef.focus()
    titleInput.value?.inputRef.select()
    void router.replace({ query: {} })
  }
})

// Opened from the TODOs page (`?todo=<n>`): to that TODO, once the editor is there. Its text
// (from the list) picks the right one if the note changed since.
const todos = useTodos()
if (route.query.todo !== undefined) {
  const index = Number(route.query.todo) || 0
  const text = todos.notes.value.find((note) => note.id === id.value)?.todos[index]?.text
  mode.value = 'edit'
  const stop = watch(
    () => editor.value?.editor,
    (ready) => {
      if (!ready) return
      queueMicrotask(() => stop())
      void nextTick(() => editor.value?.revealTodo(index, text))
      void router.replace({ query: {} })
    },
    { immediate: true },
  )
}

// --- Tags ------------------------------------------------------------------------------------

const tags = ref<string[]>(doc.note.value?.tags ?? [])
async function saveTags(value: string[]) {
  try {
    tags.value = await unwrap(
      api.notes[':id'].tags.$put({ param: { id: id.value }, json: { tags: value } }),
    )
  } catch (error) {
    showError(error, 'Could not save tags')
  }
}

// --- Changes made elsewhere ------------------------------------------------------------------

useServerEvents(async (event) => {
  if (event.type === 'resync') {
    const latest = await unwrap(api.notes[':id'].$get({ param: { id: id.value } })).catch(
      () => null,
    )
    if (latest) await applyExternal(latest.hash, 'someone')
    return
  }
  if (event.type === 'cards-removed' && event.id === id.value) {
    // A new hash, whatever it is: the note is read again (the deletion's toast said why).
    await applyExternal('', OWNER, { quiet: true })
    return
  }
  if (event.type !== 'note' || event.id !== id.value || event.author === OWNER) return
  await applyExternal(event.hash, event.author)
})

async function applyExternal(hash: string, author: string, options: { quiet?: boolean } = {}) {
  const updated = await doc.externalChange(hash)
  if (updated === null) return
  content.value = updated
  checkLosses()
  if (mode.value === 'edit') editor.value?.setContent(toEditorMarkdown(updated, notePath.value))
  if (!options.quiet)
    toast.add({
      title: `Updated by ${authorLabel(author, settings.value.displayName)}`,
      icon: 'i-lucide-sparkles',
      duration: 2500,
    })
  authorshipKey.value++
}

function keepMine() {
  void doc.keepMine()
}

function takeTheirs() {
  const theirs = doc.takeTheirs()
  if (theirs !== null) resetEditor(theirs)
}

const comparing = ref(false)

onBeforeRouteLeave(async () => {
  await doc.flush()
})

// --- Layout ----------------------------------------------------------------------------------

/** Scrolls to a database block of the note (from the side panel). */
function goToDatabase(databaseId: string) {
  document
    .querySelector(`.note-editor [data-database-id="${CSS.escape(databaseId)}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const fullWidth = useLocalStorage('tandem-full-width', false)
const panelOpen = useLocalStorage('tandem-side-panel', true)
const authorshipKey = ref(0)
const iconPickerOpen = ref(false)

// A page without content but with child pages shows as a folder: they are listed under it.
const isFolder = computed(() => !!node.value && tree.kindOf(node.value) === 'folder')
const subPages = computed(() => (isFolder.value ? (tree.childrenOf.value.get(id.value) ?? []) : []))

// The pages it is in, above its title (the tab says which page this is): none at the top.
const breadcrumb = computed<BreadcrumbItem[]>(() =>
  tree
    .ancestors(id.value)
    .slice(0, -1)
    .map((n) => ({ label: n.title, node: n, to: `/notes/${n.id}` })),
)

const modes = [
  { value: 'edit', icon: 'i-lucide-pencil-line', label: 'Edit' },
  { value: 'source', icon: 'i-lucide-code-xml', label: 'Markdown source' },
  { value: 'authorship', icon: 'i-lucide-users', label: 'Authorship' },
] as const

// The Markdown view's copy button (shown on hover), as on code blocks.
const copied = ref(false)
async function copyMarkdown() {
  await navigator.clipboard.writeText(content.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

const deleting = ref(false)
async function remove() {
  deleting.value = false
  await doc.flush()
  // Its tab closes by itself (default.vue): the one used before shows.
  if (settings.value.trash) await tree.remove(id.value)
  else await tree.deleteForever(id.value)
}

const moreItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: 'Copy link to this note',
      icon: 'i-lucide-link',
      onSelect: () =>
        void navigator.clipboard.writeText(`[[${notePath.value.replace(/\.md$/, '')}]]`),
    },
    {
      label: 'Copy file path',
      icon: 'i-lucide-folder-tree',
      onSelect: () => void navigator.clipboard.writeText(notePath.value),
    },
  ],
  [
    {
      label: 'New child page',
      icon: 'i-lucide-file-plus',
      onSelect: () => void tree.createPage(id.value),
    },
    {
      label: fullWidth.value ? 'Normal width' : 'Full width',
      icon: fullWidth.value ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2',
      onSelect: () => (fullWidth.value = !fullWidth.value),
    },
  ],
  [
    {
      label: settings.value.trash ? 'Move to trash' : 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => (deleting.value = true),
    },
  ],
])

defineShortcuts({
  meta_s: {
    usingInput: true,
    handler: () => void doc.flush(),
  },
  // usingInput: these work while typing in the note too.
  meta_shift_e: {
    usingInput: true,
    handler: () => setMode(mode.value === 'source' ? 'edit' : 'source'),
  },
  meta_backslash: { usingInput: true, handler: () => (panelOpen.value = !panelOpen.value) },
})

const created = computed(() => (node.value ? formatDateTime(node.value.createdAt) : ''))
</script>

<template>
  <!-- Below lg the side panel takes the whole width: it replaces the note while it's open. -->
  <UDashboardPanel id="note" :ui="{ root: panelOpen ? 'max-lg:hidden' : '', body: 'p-0 sm:p-0' }">
    <template #header>
      <PageNavbar :title="node?.title ?? ''">
        <template #right>
          <UFieldGroup size="sm" class="hidden sm:flex">
            <UTooltip v-for="m in modes" :key="m.value" :text="m.label">
              <UButton
                :icon="m.icon"
                :aria-label="m.label"
                color="neutral"
                :variant="mode === m.value ? 'soft' : 'ghost'"
                @click="setMode(m.value)"
              />
            </UTooltip>
          </UFieldGroup>
          <UTooltip text="Side panel" :kbds="['meta', '\\']">
            <UButton
              icon="i-lucide-panel-right"
              color="neutral"
              :variant="panelOpen ? 'soft' : 'ghost'"
              size="sm"
              aria-label="Toggle side panel"
              @click="panelOpen = !panelOpen"
            />
          </UTooltip>
          <UDropdownMenu :items="moreItems" :content="{ align: 'end', ...keepMovedFocus }">
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="More actions"
            />
          </UDropdownMenu>
        </template>
      </PageNavbar>
    </template>

    <template #body>
      <div v-if="doc.loadError.value" class="flex h-full items-center justify-center">
        <UEmpty
          icon="i-lucide-file-x"
          :title="
            doc.loadError.value.status === 404
              ? 'This note does not exist anymore'
              : 'Could not open this note'
          "
          :description="doc.loadError.value.message"
          :actions="[{ label: 'Go home', to: '/', icon: 'i-lucide-house' }]"
        />
      </div>

      <div
        v-else-if="node"
        class="mx-auto w-full px-6 pt-10 pb-4 sm:px-12"
        :style="{ maxWidth: fullWidth ? '100%' : 'calc(var(--editor-width) + 6rem)' }"
      >
        <!-- Find bar: pinned to the top right of the note while it scrolls. -->
        <div
          v-if="findOpen && editor?.editor"
          class="sticky top-2 z-30 flex h-0 items-start justify-end"
        >
          <FindBar
            ref="findBar"
            v-model:replacing="findReplacing"
            :editor="editor.editor"
            :initial-query="findInitial"
            @close="closeFind"
          />
        </div>

        <ConflictBanner
          v-if="doc.conflict.value"
          class="mb-6"
          @keep-mine="keepMine"
          @take-theirs="takeTheirs"
          @compare="comparing = true"
        />

        <UBreadcrumb
          v-if="breadcrumb.length && !calendarDate"
          :items="breadcrumb"
          class="mb-3"
          data-testid="note-path"
          :ui="{
            root: 'min-w-0',
            list: 'min-w-0 flex-wrap',
            link: 'min-w-0 text-xs text-muted',
            linkLabel: 'truncate',
            separatorIcon: 'size-3.5',
          }"
        >
          <template #item-leading="{ item }">
            <NodeIcon :icon="item.node.icon" :kind="tree.kindOf(item.node)" />
          </template>
        </UBreadcrumb>

        <div
          v-if="calendarDate"
          class="flex items-center gap-2 leading-tight font-bold tracking-tight"
          :style="{
            fontFamily: 'var(--editor-font)',
            fontSize: 'calc(var(--editor-font-size) * 1.75)',
          }"
        >
          <UIcon name="i-lucide-calendar-days" class="size-[0.9em] shrink-0 text-primary" />
          <h1 class="min-w-0 flex-1 text-balance text-highlighted" data-testid="day-title">
            {{ dayTitle }}
          </h1>
          <div class="flex shrink-0 items-center gap-0.5 text-base">
            <UButton
              v-if="calendarDate !== today"
              label="Today"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="daily.open()"
            />
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Previous day"
              @click="goToDay(-1)"
            />
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Next day"
              @click="goToDay(1)"
            />
          </div>
        </div>

        <!-- The page's icon, left of the title (click to change it): every page has one, the
             default icon until another is chosen. -->
        <div
          v-else
          class="group/header flex items-center gap-[0.3em] leading-tight font-bold tracking-tight"
          :style="{
            fontFamily: 'var(--editor-font)',
            fontSize: 'calc(var(--editor-font-size) * 2.25)',
          }"
        >
          <UPopover v-model:open="iconPickerOpen" :content="{ align: 'start' }">
            <button
              type="button"
              class="-ms-[0.1em] shrink-0 rounded-lg p-[0.05em] transition-colors hover:bg-elevated"
              aria-label="Change icon"
            >
              <NodeIcon :icon="node.icon" :kind="tree.kindOf(node)" size="title" />
            </button>
            <template #content>
              <LazyIconPicker
                :node-id="node.id"
                :has-icon="!!node.icon"
                @done="iconPickerOpen = false"
              />
            </template>
          </UPopover>

          <UInput
            ref="titleInput"
            v-model="titleDraft"
            variant="none"
            placeholder="Untitled"
            aria-label="Title"
            class="min-w-0 flex-1"
            :ui="{
              base: 'px-0 text-[length:inherit]! leading-tight font-bold tracking-tight text-highlighted placeholder:text-dimmed',
              root: 'w-full',
            }"
            @keydown.enter.prevent="titleEnter"
            @blur="commitTitle"
          />
        </div>

        <div class="mt-2 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <span v-if="!calendarDate" class="flex items-center gap-1"
            ><UIcon name="i-lucide-calendar" class="size-3.5" /> {{ created }}</span
          >
          <UInputTags
            v-if="settings.tags"
            :model-value="tags"
            placeholder="Add tag…"
            size="xs"
            variant="ghost"
            icon="i-lucide-tag"
            class="min-w-40"
            :ui="{ item: 'rounded-full' }"
            @update:model-value="saveTags"
          />
        </div>

        <UAlert
          v-if="mode === 'edit' && lossBlocks"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Read-only: the editor can't show all of this note's Markdown"
          :actions="[
            {
              label: 'Edit anyway',
              color: 'neutral',
              variant: 'outline',
              onClick: acceptLoss,
            },
            { label: 'Edit Markdown', color: 'error', onClick: () => setMode('source') },
          ]"
          orientation="horizontal"
          class="mb-6"
          data-testid="markdown-loss"
        >
          <template #description>
            Edited here, the note would lose
            <MarkdownLossLines :losses="losses" @go="goToLine" />. Change it in the Markdown view,
            or edit anyway.
          </template>
        </UAlert>

        <NoteEditor
          v-if="mode === 'edit'"
          ref="editor"
          :key="editorKey"
          :read-only="lossBlocks"
          :content="editorContent"
          :note-id="id"
          :note-path="notePath"
          @change="onEditorChange"
          @headings="headings = $event"
          @active-heading="activeHeading = $event"
        />

        <div v-else-if="mode === 'source'">
          <UAlert
            v-if="lossBlocks"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="The editor can't show all of this Markdown"
            :actions="[
              {
                label: 'Open the editor anyway',
                color: 'neutral',
                variant: 'outline',
                onClick: openAnyway,
              },
            ]"
            orientation="horizontal"
            class="mb-4"
            data-testid="markdown-loss"
          >
            <template #description>
              It would lose <MarkdownLossLines :losses="losses" @go="goToLine" />: the editor stays
              closed until that's changed.
            </template>
          </UAlert>
          <div class="group/source relative">
            <MarkdownSource
              ref="source"
              :model-value="content"
              :error-lines="lossBlocks ? losses.map((loss) => loss.line) : []"
              @update:model-value="onSourceChange"
            />
            <UTooltip :text="copied ? 'Copied' : 'Copy Markdown'">
              <UButton
                :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                color="neutral"
                variant="soft"
                aria-label="Copy Markdown"
                class="absolute top-2 right-2 opacity-0 transition-opacity group-hover/source:opacity-100 focus-visible:opacity-100"
                :class="copied && 'opacity-100'"
                @click="copyMarkdown"
              />
            </UTooltip>
          </div>
        </div>

        <AuthorshipView
          v-else
          :key="authorshipKey"
          :note-id="id"
          :content="content"
          :note-path="notePath"
        />

        <!-- After the modes' v-if chain: inside it, it would take their v-else-if. -->
        <nav
          v-if="mode === 'edit' && subPages.length"
          aria-label="Pages in this folder"
          class="mt-6"
          data-testid="sub-pages"
        >
          <ul class="divide-y divide-default rounded-lg border border-default">
            <li v-for="child in subPages" :key="child.id">
              <NuxtLink
                :to="`/notes/${child.id}`"
                class="flex items-center gap-2.5 px-4 py-2.5 text-sm text-default transition-colors hover:bg-elevated/60"
              >
                <NodeIcon :icon="child.icon" :kind="tree.kindOf(child)" />
                <span class="min-w-0 flex-1 truncate">{{ child.title }}</span>
              </NuxtLink>
            </li>
          </ul>
        </nav>
      </div>
    </template>
  </UDashboardPanel>

  <NoteSidePanel
    v-if="panelOpen && node && !doc.loadError.value"
    :note-id="id"
    :calendar-date="calendarDate"
    :note-path="notePath"
    :headings="headings"
    :active-heading="activeHeading"
    :content="content"
    @go-to-heading="(pos) => editor?.scrollTo(pos)"
    @go-to-database="goToDatabase"
    @restored="(restored) => resetEditor(restored)"
    @attach="appendMarkdown"
    @close="panelOpen = false"
  />

  <DiffModal
    v-if="doc.conflict.value"
    v-model:open="comparing"
    title="Your version vs. the saved one"
    :before="doc.conflict.value.content"
    :after="content"
    before-label="Saved (theirs)"
    after-label="Yours"
  />

  <UModal
    v-model:open="deleting"
    :title="settings.trash ? 'Move to trash?' : `Delete “${node?.title}” forever?`"
    :description="
      settings.trash
        ? `“${node?.title}” and its child pages will be moved to the trash.`
        : DELETE_FOREVER
    "
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="deleting = false" />
        <UButton
          :label="settings.trash ? 'Move to trash' : 'Delete forever'"
          color="error"
          icon="i-lucide-trash-2"
          @click="remove"
        />
      </div>
    </template>
  </UModal>
</template>
