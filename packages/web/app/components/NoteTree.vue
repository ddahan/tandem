<script setup lang="ts">
// The sidebar tree: pages and folders, with drag and drop (before, after or inside a node),
// inline renaming and a context menu on each row.
import type { DropdownMenuItem } from '@nuxt/ui'
import { useLocalStorage } from '@vueuse/core'
import type { TreeItem } from '~/composables/useTree'

const tree = useTree()
const route = useRoute()
const showError = useApiErrorToast()

const expanded = useLocalStorage<string[]>('myfluence-tree-expanded', [])
const currentId = computed(() => (route.name === 'notes-id' ? String(route.params.id) : null))

// Keep the current note visible: expand its ancestors.
watch(
  [currentId, () => tree.nodes.value.length],
  () => {
    if (!currentId.value) return
    const ancestors = tree
      .ancestors(currentId.value)
      .slice(0, -1)
      .map((n) => n.id)
    const missing = ancestors.filter((id) => !expanded.value.includes(id))
    if (missing.length) expanded.value = [...expanded.value, ...missing]
  },
  { immediate: true },
)

function open(item: TreeItem) {
  if (item.node.kind === 'page') void navigateTo(`/notes/${item.id}`)
  else toggle(item.id)
}

function toggle(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter((x) => x !== id)
    : [...expanded.value, id]
}

// --- Renaming ------------------------------------------------------------------------------

const renamingId = ref<string | null>(null)
const renameValue = ref('')

function startRename(item: TreeItem) {
  renamingId.value = item.id
  renameValue.value = item.label
}

async function commitRename() {
  const id = renamingId.value
  renamingId.value = null
  const title = renameValue.value.trim()
  if (id && title && title !== tree.byId.value.get(id)?.title) await tree.rename(id, title)
}

// --- Deleting ------------------------------------------------------------------------------

const deleting = ref<TreeItem | null>(null)
/** The node whose icon is being changed (picker dialog). */
const iconFor = ref<TreeItem | null>(null)

async function confirmDelete() {
  const item = deleting.value
  deleting.value = null
  if (!item) return
  const wasOpen = currentId.value && tree.isWithin(currentId.value, item.id)
  if ((await tree.remove(item.id)) && wasOpen) await navigateTo('/')
}

// --- Menu ------------------------------------------------------------------------------------

async function createInside(item: TreeItem | null, kind: 'page' | 'folder') {
  if (item && !expanded.value.includes(item.id)) expanded.value = [...expanded.value, item.id]
  if (kind === 'page') await tree.createPage(item?.id ?? null)
  else {
    const folder = await tree.createFolder(item?.id ?? null)
    if (folder) startRename({ id: folder.id, label: folder.title, node: folder, icon: '' })
  }
}

function menu(item: TreeItem): DropdownMenuItem[][] {
  return [
    [
      {
        label: 'New page inside',
        icon: 'i-lucide-file-plus',
        onSelect: () => void createInside(item, 'page'),
      },
      {
        label: 'New folder inside',
        icon: 'i-lucide-folder-plus',
        onSelect: () => void createInside(item, 'folder'),
      },
    ],
    [
      { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => startRename(item) },
      {
        label: 'Change icon…',
        icon: 'i-lucide-smile-plus',
        onSelect: () => (iconFor.value = item),
      },
      ...(item.node.kind === 'page'
        ? [
            {
              label: 'Copy link',
              icon: 'i-lucide-link',
              onSelect: () =>
                void navigator.clipboard.writeText(`[[${item.node.path.replace(/\.md$/, '')}]]`),
            },
          ]
        : []),
    ],
    [
      {
        label: 'Delete',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => (deleting.value = item),
      },
    ],
  ]
}

const rootMenu: DropdownMenuItem[] = [
  {
    label: 'New page',
    icon: 'i-lucide-file-plus',
    kbds: ['meta', 'alt', 'n'],
    onSelect: () => void createInside(null, 'page'),
  },
  {
    label: 'New folder',
    icon: 'i-lucide-folder-plus',
    onSelect: () => void createInside(null, 'folder'),
  },
]

// --- Drag and drop ---------------------------------------------------------------------------

type DropZone = 'before' | 'inside' | 'after'
const dragged = ref<string | null>(null)
const dropTarget = ref<{ id: string | null; zone: DropZone } | null>(null)

function onDragStart(event: DragEvent, item: TreeItem) {
  dragged.value = item.id
  event.dataTransfer?.setData('application/x-myfluence-node', item.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function zoneOf(event: DragEvent): DropZone {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = (event.clientY - rect.top) / rect.height
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
}

function canDrop(targetId: string): boolean {
  return !!dragged.value && dragged.value !== targetId && !tree.isWithin(targetId, dragged.value)
}

function onDragOver(event: DragEvent, item: TreeItem) {
  if (!canDrop(item.id)) return
  event.preventDefault()
  dropTarget.value = { id: item.id, zone: zoneOf(event) }
}

async function onDrop(event: DragEvent, item: TreeItem) {
  event.preventDefault()
  const id = dragged.value
  const zone = zoneOf(event)
  const allowed = canDrop(item.id)
  reset()
  if (!id || !allowed) return
  if (zone === 'inside') {
    if (!expanded.value.includes(item.id)) expanded.value = [...expanded.value, item.id]
    await tree.move(id, item.id)
    return
  }
  const parentId = item.node.parentId
  const siblings = (tree.childrenOf.value.get(parentId) ?? []).filter((n) => n.id !== id)
  const index = siblings.findIndex((n) => n.id === item.id) + (zone === 'after' ? 1 : 0)
  await tree.move(id, parentId, index)
}

function onDropOnRoot(event: DragEvent) {
  event.preventDefault()
  const id = dragged.value
  reset()
  if (id) void tree.move(id, null).catch(showError)
}

function reset() {
  dragged.value = null
  dropTarget.value = null
}

function rowClass(item: TreeItem) {
  const target = dropTarget.value?.id === item.id ? dropTarget.value.zone : null
  return [
    currentId.value === item.id
      ? 'bg-elevated text-highlighted font-medium'
      : 'text-default hover:bg-elevated/60',
    dragged.value === item.id && 'opacity-50',
    target === 'inside' && 'ring-2 ring-primary ring-inset',
    target === 'before' && 'shadow-[inset_0_2px_0_0_var(--ui-primary)]',
    target === 'after' && 'shadow-[inset_0_-2px_0_0_var(--ui-primary)]',
  ]
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="flex items-center justify-between px-2.5 pb-1">
      <span class="text-xs font-medium text-muted">Pages</span>
      <UDropdownMenu :items="rootMenu" :content="{ align: 'start' }">
        <UButton
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="New page or folder"
        />
      </UDropdownMenu>
    </div>

    <div
      class="min-h-0 flex-1 overflow-y-auto px-1"
      @dragover.prevent
      @drop="onDropOnRoot"
      @dragend="reset"
    >
      <UTree
        v-model:expanded="expanded"
        :items="tree.items.value"
        :get-key="(item: TreeItem) => item.id"
        :on-select="
          (event: Event, item: TreeItem) => {
            event.preventDefault()
            open(item)
          }
        "
        :ui="{ listWithChildren: 'ms-3 border-s border-default ps-1' }"
        size="sm"
      >
        <template #item-wrapper="{ item, expanded: isExpanded }">
          <div
            class="group relative flex h-7 cursor-pointer items-center gap-1 rounded-md ps-1 pe-1 text-sm transition-colors select-none"
            :class="rowClass(item)"
            draggable="true"
            :data-testid="`tree-${item.label}`"
            @click="open(item)"
            @dragstart="onDragStart($event, item)"
            @dragover.stop="onDragOver($event, item)"
            @dragleave="dropTarget = null"
            @drop.stop="onDrop($event, item)"
            @dragend="reset"
          >
            <button
              v-if="item.children?.length"
              type="button"
              class="grid size-5 shrink-0 place-items-center rounded text-dimmed hover:text-default"
              :aria-label="isExpanded ? 'Collapse' : 'Expand'"
              @click.stop="toggle(item.id)"
            >
              <UIcon
                name="i-lucide-chevron-right"
                class="size-3.5 transition-transform"
                :class="isExpanded && 'rotate-90'"
              />
            </button>
            <span v-else class="size-5 shrink-0" />
            <NodeIcon :icon="item.node.icon" :kind="item.node.kind" />

            <UInput
              v-if="renamingId === item.id"
              v-model="renameValue"
              size="xs"
              autofocus
              class="min-w-0 flex-1"
              @click.stop
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="renamingId = null"
              @blur="commitRename"
            />
            <span v-else class="min-w-0 flex-1 truncate" @dblclick.stop="startRename(item)">{{
              item.label
            }}</span>

            <div
              v-if="renamingId !== item.id"
              class="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
              @click.stop
            >
              <UDropdownMenu :items="menu(item)" :content="{ align: 'start' }">
                <UButton
                  icon="i-lucide-ellipsis"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Actions"
                />
              </UDropdownMenu>
              <UButton
                icon="i-lucide-plus"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="New page inside"
                @click="createInside(item, 'page')"
              />
            </div>
          </div>
        </template>
      </UTree>

      <UEmpty
        v-if="tree.loaded.value && !tree.items.value.length"
        icon="i-lucide-notebook-pen"
        title="No pages yet"
        description="Create your first page."
        :actions="[
          { label: 'New page', icon: 'i-lucide-plus', onClick: () => void tree.createPage() },
        ]"
        size="sm"
        variant="naked"
      />
    </div>

    <UModal
      :open="!!iconFor"
      :title="iconFor ? `Icon of “${iconFor.label}”` : ''"
      :ui="{ content: 'max-w-fit', body: 'p-0 sm:p-0' }"
      @update:open="(open) => !open && (iconFor = null)"
    >
      <template #body>
        <IconPicker
          v-if="iconFor"
          :node-id="iconFor.id"
          :has-icon="!!iconFor.node.icon"
          @done="iconFor = null"
        />
      </template>
    </UModal>

    <UModal
      :open="!!deleting"
      title="Move to trash?"
      :description="
        deleting
          ? `“${deleting.label}”${deleting.children?.length ? ' and everything inside it' : ''} will be moved to the trash. You can restore it from there.`
          : ''
      "
      @update:open="(value) => !value && (deleting = null)"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="deleting = null" />
          <UButton
            label="Move to trash"
            color="error"
            icon="i-lucide-trash-2"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
