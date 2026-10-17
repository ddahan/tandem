<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem } from '@nuxt/ui'
import { useLocalStorage } from '@vueuse/core'
import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import { OWNER, authorLabel, formatDateTime } from '@tandem/shared'
import type { Heading } from '~/components/NoteEditor.vue'
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
await doc.load()

const node = computed(() => tree.byId.value.get(id.value) ?? doc.note.value?.node ?? null)
const notePath = computed(() => node.value?.path ?? doc.note.value?.node.path ?? '')

useHead({ title: () => node.value?.title || 'Untitled' })

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

function resetEditor(markdown: string) {
  content.value = markdown
  editorContent.value = toEditorMarkdown(markdown, notePath.value)
  editorKey.value++
}

function onEditorChange(markdown: string) {
  content.value = normalizeMarkdown(fromEditorMarkdown(markdown, notePath.value))
  doc.change(content.value)
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
  if (event.type !== 'note' || event.id !== id.value || event.author === OWNER) return
  await applyExternal(event.hash, event.author)
})

async function applyExternal(hash: string, author: string) {
  const updated = await doc.externalChange(hash)
  if (updated === null) return
  content.value = updated
  if (mode.value === 'edit') editor.value?.setContent(toEditorMarkdown(updated, notePath.value))
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

const fullWidth = useLocalStorage('tandem-full-width', false)
const panelOpen = useLocalStorage('tandem-side-panel', true)
const authorshipKey = ref(0)
const iconPickerOpen = ref(false)

const breadcrumb = computed<BreadcrumbItem[]>(() =>
  tree.ancestors(id.value).map((n, index, all) => ({
    label: n.title,
    node: n,
    to: n.kind === 'page' && index < all.length - 1 ? `/notes/${n.id}` : undefined,
  })),
)

const modes = [
  { value: 'edit', icon: 'i-lucide-pencil-line', label: 'Edit' },
  { value: 'source', icon: 'i-lucide-code-xml', label: 'Markdown source' },
  { value: 'authorship', icon: 'i-lucide-users', label: 'Authorship' },
] as const

const deleting = ref(false)
async function remove() {
  deleting.value = false
  await doc.flush()
  if (await tree.remove(id.value)) await navigateTo('/')
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
    // Only while the Markdown itself is shown.
    ...(mode.value === 'source'
      ? [
          {
            label: 'Copy Markdown',
            icon: 'i-lucide-clipboard-copy',
            onSelect: () => void navigator.clipboard.writeText(content.value),
          },
        ]
      : []),
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
      label: 'Move to trash',
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
    handler: () => (mode.value = mode.value === 'source' ? 'edit' : 'source'),
  },
  meta_backslash: { usingInput: true, handler: () => (panelOpen.value = !panelOpen.value) },
})

const created = computed(() => (node.value ? formatDateTime(node.value.createdAt) : ''))
</script>

<template>
  <UDashboardPanel id="note" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <UDashboardNavbar :ui="{ title: 'min-w-0', root: 'gap-2' }">
        <template #title>
          <UBreadcrumb
            :items="breadcrumb"
            :ui="{
              root: 'min-w-0',
              list: 'min-w-0 flex-nowrap',
              item: 'min-w-0',
              link: 'min-w-0',
              linkLabel: 'truncate',
            }"
          >
            <template #item-leading="{ item }">
              <NodeIcon :icon="item.node.icon" :kind="item.node.kind" />
            </template>
          </UBreadcrumb>
        </template>
        <template #right>
          <SaveStatus :status="doc.status.value" :saved-at="doc.savedAt.value" />
          <UFieldGroup size="sm" class="hidden sm:flex">
            <UTooltip v-for="m in modes" :key="m.value" :text="m.label">
              <UButton
                :icon="m.icon"
                :aria-label="m.label"
                color="neutral"
                :variant="mode === m.value ? 'soft' : 'ghost'"
                @click="mode = m.value"
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
          <UDropdownMenu :items="moreItems" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="More actions"
            />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
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

        <!-- The page's icon, left of the title (click to change it). Without one, "Add icon"
             shows on hover in the line below. -->
        <div
          class="group/header flex items-center gap-[0.3em] leading-tight font-bold tracking-tight"
          :style="{
            fontFamily: 'var(--editor-font)',
            fontSize: 'calc(var(--editor-font-size) * 2.25)',
          }"
        >
          <UPopover v-if="node.icon" v-model:open="iconPickerOpen" :content="{ align: 'start' }">
            <button
              type="button"
              class="-ms-[0.1em] shrink-0 rounded-lg p-[0.05em] transition-colors hover:bg-elevated"
              aria-label="Change icon"
            >
              <NodeIcon :icon="node.icon" :kind="node.kind" size="title" />
            </button>
            <template #content>
              <LazyIconPicker :node-id="node.id" has-icon @done="iconPickerOpen = false" />
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

        <div
          class="group/meta mt-2 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted"
        >
          <span class="flex items-center gap-1"
            ><UIcon name="i-lucide-calendar" class="size-3.5" /> {{ created }}</span
          >
          <UPopover v-if="!node.icon" v-model:open="iconPickerOpen" :content="{ align: 'start' }">
            <UButton
              label="Add icon"
              icon="i-lucide-smile-plus"
              color="neutral"
              variant="ghost"
              size="xs"
              class="-mx-2 opacity-0 transition-opacity group-hover/meta:opacity-100 focus-visible:opacity-100"
              :class="iconPickerOpen && 'opacity-100'"
            />
            <template #content>
              <LazyIconPicker :node-id="node.id" :has-icon="false" @done="iconPickerOpen = false" />
            </template>
          </UPopover>
          <UInputTags
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

        <NoteEditor
          v-if="mode === 'edit'"
          ref="editor"
          :key="editorKey"
          :content="editorContent"
          :note-id="id"
          :note-path="notePath"
          @change="onEditorChange"
          @headings="headings = $event"
        />

        <UTextarea
          v-else-if="mode === 'source'"
          :model-value="content"
          autoresize
          :rows="20"
          variant="soft"
          class="w-full"
          :ui="{ base: 'font-mono text-sm leading-6' }"
          aria-label="Markdown source"
          @update:model-value="(value) => onSourceChange(String(value))"
        />

        <AuthorshipView
          v-else
          :key="authorshipKey"
          :note-id="id"
          :content="content"
          :note-path="notePath"
        />
      </div>
    </template>
  </UDashboardPanel>

  <NoteSidePanel
    v-if="panelOpen && node && !doc.loadError.value"
    :note-id="id"
    :note-path="notePath"
    :headings="headings"
    :content="content"
    @go-to-heading="(pos) => editor?.scrollTo(pos)"
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
    title="Move to trash?"
    :description="`“${node?.title}” and its child pages will be moved to the trash.`"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="deleting = false" />
        <UButton label="Move to trash" color="error" icon="i-lucide-trash-2" @click="remove" />
      </div>
    </template>
  </UModal>
</template>
