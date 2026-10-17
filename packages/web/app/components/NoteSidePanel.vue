<script setup lang="ts">
// The note's side panel: outline, backlinks, history and attachments.
import type { TabsItem } from '@nuxt/ui'
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
  restored: [content: string]
  attach: [markdown: string]
  close: []
}>()

const tab = useLocalStorage('tandem-side-tab', 'outline')

const tabs: TabsItem[] = [
  { label: 'Outline', value: 'outline', icon: 'i-lucide-list-tree' },
  { label: 'Links', value: 'links', icon: 'i-lucide-link-2' },
  { label: 'History', value: 'history', icon: 'i-lucide-history' },
  { label: 'Files', value: 'files', icon: 'i-lucide-paperclip' },
]
</script>

<template>
  <UDashboardPanel
    id="note-side"
    resizable
    :min-size="16"
    :default-size="21"
    :max-size="34"
    :ui="{ body: 'gap-2 p-3 sm:p-3' }"
  >
    <template #header>
      <div
        class="flex h-(--ui-header-height) shrink-0 items-center gap-1 border-b border-default px-2"
      >
        <UTabs
          v-model="tab"
          :items="tabs"
          :content="false"
          variant="link"
          size="xs"
          class="min-w-0 flex-1"
          :ui="{ list: 'border-0', trigger: 'px-1.5', label: 'hidden xl:inline' }"
        />
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
      <SideAttachments
        v-else
        :note-id="noteId"
        :note-path="notePath"
        @insert="(md) => $emit('attach', md)"
      />
    </template>
  </UDashboardPanel>
</template>
