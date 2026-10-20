<script setup lang="ts">
// The note's side panel: outline, backlinks, history, attachments and databases.
import { useLocalStorage } from '@vueuse/core'
import type { Heading } from '~/components/NoteEditor.vue'

defineProps<{
  noteId: string
  notePath: string
  headings: Heading[]
  /** Index in `headings` of the heading the reader is in (-1: none). */
  activeHeading: number
  content: string
}>()
defineEmits<{
  goToHeading: [pos: number]
  goToDatabase: [id: string]
  restored: [content: string]
  attach: [markdown: string]
  close: []
}>()

const tab = useLocalStorage('tandem-side-tab', 'outline')

// --- Width -----------------------------------------------------------------------------------
// Resizable from its left edge, as the sidebar is from its right one. Nuxt UI's resizable panel
// puts its handle on the right, which for this panel is the window's edge: the handle is Nuxt
// UI's, the dragging ours. In rem, remembered; double-click goes back to the default.
const MIN_WIDTH = 16
const MAX_WIDTH = 34
const DEFAULT_WIDTH = 21
const width = useLocalStorage('tandem-side-width', () => {
  // The width Nuxt UI's panel kept before.
  const previous = Number(globalThis.localStorage?.getItem('tandem-panels-panel-note-side'))
  return previous >= MIN_WIDTH && previous <= MAX_WIDTH ? previous : DEFAULT_WIDTH
})
const dragging = ref(false)

function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const startX = event.clientX
  const startWidth = width.value
  dragging.value = true
  const move = (moved: PointerEvent) => {
    const next = startWidth + (startX - moved.clientX) / rem
    width.value = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)) * 100) / 100
  }
  const end = () => {
    dragging.value = false
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
}

const tabs = [
  { label: 'Outline', value: 'outline', icon: 'i-lucide-list-tree' },
  { label: 'Links', value: 'links', icon: 'i-lucide-link-2' },
  { label: 'History', value: 'history', icon: 'i-lucide-history' },
  { label: 'Files', value: 'files', icon: 'i-lucide-paperclip' },
  { label: 'Databases', value: 'databases', icon: 'i-lucide-database' },
] as const
</script>

<template>
  <UDashboardResizeHandle
    aria-label="Resize the side panel"
    aria-controls="tandem-panels-panel-note-side"
    :aria-valuenow="width"
    :aria-valuemin="MIN_WIDTH"
    :aria-valuemax="MAX_WIDTH"
    data-testid="side-panel-resize"
    @pointerdown="startResize"
    @dblclick="width = DEFAULT_WIDTH"
  />
  <UDashboardPanel
    id="note-side"
    data-testid="side-panel"
    :data-dragging="dragging || undefined"
    :style="{ '--side-width': `${width}rem` }"
    :ui="{ root: 'w-full flex-none lg:w-(--side-width)', body: 'gap-2 p-3 sm:p-3' }"
  >
    <template #header>
      <div
        class="flex h-(--ui-header-height) shrink-0 items-center gap-1 border-b border-default px-2"
      >
        <!-- Icons only, named by their tooltip, as the note's mode buttons. -->
        <div
          role="tablist"
          aria-label="Side panel"
          class="flex min-w-0 flex-1 items-center gap-0.5"
        >
          <UTooltip v-for="item in tabs" :key="item.value" :text="item.label">
            <UButton
              role="tab"
              :aria-selected="tab === item.value"
              :aria-label="item.label"
              :icon="item.icon"
              color="neutral"
              :variant="tab === item.value ? 'soft' : 'ghost'"
              size="sm"
              @click="tab = item.value"
            />
          </UTooltip>
        </div>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Close panel"
          @click="$emit('close')"
        />
      </div>
    </template>

    <template #body>
      <SideOutline
        v-if="tab === 'outline'"
        :headings="headings"
        :active="activeHeading"
        @go="(pos) => $emit('goToHeading', pos)"
      />
      <SideBacklinks v-else-if="tab === 'links'" :note-id="noteId" :content="content" />
      <SideHistory
        v-else-if="tab === 'history'"
        :note-id="noteId"
        :note-path="notePath"
        :content="content"
        @restored="(c) => $emit('restored', c)"
      />
      <SideDatabases
        v-else-if="tab === 'databases'"
        :note-id="noteId"
        :content="content"
        @go="(id) => $emit('goToDatabase', id)"
      />
      <SideAttachments
        v-else
        :note-id="noteId"
        :note-path="notePath"
        @insert="(md) => $emit('attach', md)"
      />
    </template>
  </UDashboardPanel>
</template>
