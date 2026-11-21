<script setup lang="ts">
// The side panel's Items tab: what the page holds, in four sections (SideSubtree), Files,
// Bookmarks (when on), Databases and Page links, each with its sub-pages' too. Their display,
// Tree or Flat, is one switch at the top (remembered), there only when a sub-page holds
// something; each page's own list (SideAttachments, SideBookmarks, SideDatabases,
// SideBacklinks) reports how many it holds, for its section's count and empty line.
import type { Attachment, SubtreeItems } from '@tandem/shared'
import { useLocalStorage } from '@vueuse/core'
import type { SubtreeKind } from './SideSubtree.vue'

const props = defineProps<{
  noteId: string
  notePath: string
  content: string
  /** The page and its sub-pages' items: null without sub-pages, or until read. */
  items: SubtreeItems | null
  /** Sub-pages whose items aren't read yet. */
  pending: boolean
}>()
const emit = defineEmits<{
  goToDatabase: [id: string]
  attach: [markdown: string]
  deleted: [attachment: Attachment]
}>()

const { settings } = useSettings()

const display = useLocalStorage<'tree' | 'flat'>('tandem-side-display', 'tree')
const displays = [
  { value: 'tree', label: 'Tree', icon: 'i-lucide-list-tree' },
  { value: 'flat', label: 'Flat', icon: 'i-lucide-list' },
] as const

/** A sub-page holds something of a section shown: the switch has something to change. */
const below = computed(() =>
  (props.items?.pages ?? []).some(
    (page) =>
      page.depth > 0 &&
      (page.attachments.length ||
        page.databases.length ||
        page.wikiLinks.length ||
        (settings.value.bookmarks && (page.bookmarkIds.length || page.links.length))),
  ),
)

// One note's: the note page, and so the panel, is made again for each note.
const own = reactive<Partial<Record<SubtreeKind, number>>>({})

const attachments = useTemplateRef('attachments')
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="side-items">
    <div
      v-if="below"
      role="radiogroup"
      aria-label="Display"
      class="flex gap-0.5"
      data-testid="side-display"
    >
      <UButton
        v-for="option in displays"
        :key="option.value"
        role="radio"
        :aria-checked="display === option.value"
        :label="option.label"
        :icon="option.icon"
        size="xs"
        color="neutral"
        :variant="display === option.value ? 'soft' : 'ghost'"
        @click="display = option.value"
      />
    </div>

    <SideSubtree
      kind="files"
      :items="items"
      :display="display"
      :own="pending ? undefined : own.files"
    >
      <template #actions>
        <UTooltip text="Add files">
          <UButton
            icon="i-lucide-plus"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Add files"
            @click="attachments?.pick()"
          />
        </UTooltip>
      </template>
      <SideAttachments
        ref="attachments"
        :note-id="noteId"
        :note-path="notePath"
        @count="(n) => (own.files = n)"
        @insert="(md) => emit('attach', md)"
        @deleted="(attachment) => emit('deleted', attachment)"
      />
      <template #empty>
        Drop files on the note, or
        <button type="button" class="text-primary hover:underline" @click="attachments?.pick()">
          click here</button
        >.
      </template>
    </SideSubtree>

    <SideSubtree
      v-if="settings.bookmarks"
      kind="bookmarks"
      :items="items"
      :display="display"
      :own="pending ? undefined : own.bookmarks"
    >
      <SideBookmarks :content="content" @count="(n) => (own.bookmarks = n)" />
      <template #empty>Type /bookmark in the note, or link a website.</template>
    </SideSubtree>

    <SideSubtree
      kind="databases"
      :items="items"
      :display="display"
      :own="pending ? undefined : own.databases"
    >
      <SideDatabases
        :note-id="noteId"
        :content="content"
        @count="(n) => (own.databases = n)"
        @go="(id) => emit('goToDatabase', id)"
      />
      <template #empty>Type /database in the note to add one.</template>
    </SideSubtree>

    <SideSubtree
      kind="links"
      :items="items"
      :display="display"
      :own="pending ? undefined : own.links"
    >
      <SideBacklinks :note-id="noteId" :content="content" @count="(n) => (own.links = n)" />
      <template #empty>
        Type <span data-keys-shown><UKbd size="sm">[[</UKbd></span> in the note to link a page.
      </template>
    </SideSubtree>

    <p v-if="items?.truncated" class="px-2 text-xs text-dimmed">
      Only the first 500 pages under this one are read.
    </p>
  </div>
</template>
