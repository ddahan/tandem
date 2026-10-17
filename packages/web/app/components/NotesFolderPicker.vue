<script setup lang="ts">
// Picks the notes folder (Settings › Notes folder). The server lists folders (a browser can't
// see paths) and switches: it restarts on the new folder, then the app reloads.
import type { FolderListing } from '@tandem/shared'

const props = defineProps<{ current: string }>()
const open = defineModel<boolean>('open', { default: false })

const api = useApi()
const listing = ref<FolderListing | null>(null)
const error = ref('')
const loading = ref(false)
const typed = ref('')
const newName = ref<string | null>(null)
const switching = ref(false)

async function load(path: string) {
  loading.value = true
  error.value = ''
  try {
    listing.value = await unwrap(api['disk-folders'].$get({ query: { path } }))
    typed.value = listing.value.path
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    loading.value = false
  }
}

// Opens in the current folder's parent: its neighbours are the likely alternatives.
watch(open, (isOpen) => {
  if (!isOpen) return
  newName.value = null
  void load(props.current.replace(/\/[^/]+\/?$/, '') || '/')
})

/** The path as clickable parts. */
const crumbs = computed(() => {
  const path = listing.value?.path ?? ''
  const parts = path.split('/').filter(Boolean)
  return [
    { name: '/', path: '/' },
    ...parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join('/')}` })),
  ]
})

const summary = computed(() => {
  const value = listing.value
  if (!value) return ''
  if (value.path === props.current) return 'This is the current notes folder.'
  if (value.problem) return value.problem
  if (value.tandem) return 'Holds Tandem notes: their history, tags and authorship come along.'
  if (value.markdownFiles) {
    return `${value.markdownFiles} Markdown file${value.markdownFiles === 1 ? '' : 's'} here: they become notes.`
  }
  return 'An empty start: Tandem keeps everything in this folder.'
})
const usable = computed(
  () => !!listing.value && !listing.value.problem && listing.value.path !== props.current,
)

async function createFolder() {
  const name = newName.value?.trim()
  if (!name || !listing.value) return
  try {
    const { path } = await unwrap(
      api['disk-folders'].$post({ json: { parent: listing.value.path, name } }),
    )
    newName.value = null
    await load(path)
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  }
}

/** Switches, then waits for Tandem to answer on the new folder and reloads. */
async function useFolder() {
  if (!listing.value || !usable.value) return
  const path = listing.value.path
  switching.value = true
  error.value = ''
  try {
    await unwrap(api['notes-folder'].$put({ json: { path } }))
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      const now = await unwrap(api['notes-folder'].$get()).catch(() => null)
      if (now?.path === path) {
        window.location.href = '/'
        return
      }
    }
    throw new Error('Tandem took too long to restart. Reload the page in a moment.')
  } catch (failure) {
    switching.value = false
    error.value = failure instanceof Error ? failure.message : String(failure)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Choose the notes folder"
    description="Tandem keeps your notes there, as Markdown files. A OneDrive or iCloud folder works, to sync and back them up."
    :dismissible="!switching"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div
        v-if="switching"
        class="flex flex-col items-center gap-3 py-10 text-center"
        data-testid="notes-folder-switching"
      >
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
        <p class="text-sm text-default">Switching to {{ listing?.path }}…</p>
        <p class="text-xs text-muted">Tandem restarts on it, then opens again.</p>
      </div>

      <div v-else class="space-y-3" data-testid="notes-folder-picker">
        <div v-if="listing?.places.length" class="flex flex-wrap gap-1.5">
          <UButton
            v-for="place in listing.places"
            :key="place.path"
            :label="place.label"
            size="xs"
            color="neutral"
            variant="soft"
            @click="load(place.path)"
          />
        </div>

        <div class="flex flex-wrap items-center gap-0.5 text-sm" aria-label="Path">
          <template v-for="(crumb, index) in crumbs" :key="crumb.path">
            <UIcon v-if="index > 1" name="i-lucide-chevron-right" class="size-3.5 text-dimmed" />
            <button
              type="button"
              class="rounded px-1 py-0.5 hover:bg-elevated"
              :class="index === crumbs.length - 1 ? 'font-medium text-highlighted' : 'text-muted'"
              @click="load(crumb.path)"
            >
              {{ crumb.name }}
            </button>
          </template>
        </div>

        <div class="h-72 overflow-y-auto rounded-lg border border-default">
          <div v-if="loading && !listing" class="p-4 text-sm text-muted">Loading…</div>
          <button
            v-if="listing?.parent"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted hover:bg-elevated"
            @click="load(listing.parent)"
          >
            <UIcon name="i-lucide-corner-left-up" class="size-4" /> ..
          </button>
          <button
            v-for="folder in listing?.folders ?? []"
            :key="folder.path"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-default hover:bg-elevated"
            @click="load(folder.path)"
          >
            <UIcon name="i-lucide-folder" class="size-4 shrink-0 text-dimmed" />
            <span class="truncate">{{ folder.name }}</span>
          </button>
          <p v-if="listing && !listing.folders.length" class="px-3 py-2 text-sm text-dimmed">
            No folders inside.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="typed"
            class="min-w-0 flex-1"
            size="sm"
            icon="i-lucide-folder-search"
            aria-label="Folder path"
            placeholder="/Users/you/Notes"
            @keydown.enter.prevent="load(typed)"
          />
          <template v-if="newName !== null">
            <UInput
              v-model="newName"
              size="sm"
              autofocus
              aria-label="New folder name"
              placeholder="New folder"
              @keydown.enter.prevent="createFolder"
              @keydown.esc.prevent="newName = null"
            />
            <UButton
              label="Create"
              size="sm"
              color="neutral"
              variant="soft"
              @click="createFolder"
            />
          </template>
          <UButton
            v-else
            label="New folder"
            icon="i-lucide-folder-plus"
            size="sm"
            color="neutral"
            variant="ghost"
            :disabled="!listing"
            @click="newName = ''"
          />
        </div>

        <p
          v-if="error"
          class="flex items-start gap-1.5 text-sm text-error"
          data-testid="notes-folder-error"
        >
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" /> {{ error }}
        </p>
      </div>
    </template>

    <template v-if="!switching" #footer>
      <div class="flex w-full items-center gap-3">
        <p
          class="min-w-0 flex-1 text-sm"
          :class="listing?.problem && listing.path !== current ? 'text-error' : 'text-muted'"
          data-testid="notes-folder-summary"
        >
          <UIcon
            v-if="listing?.tandem && usable"
            name="i-lucide-badge-check"
            class="me-1 size-4 align-[-3px] text-primary"
          />{{ summary }}
        </p>
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton label="Use this folder" :disabled="!usable" @click="useFolder" />
      </div>
    </template>
  </UModal>
</template>
