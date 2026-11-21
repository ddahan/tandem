<script setup lang="ts">
// An image shown full screen, as large as the window lets it be without cropping or stretching
// it: from a double click on an image in a note, or a click in the side panel's Files. Esc, the close
// button or a click around the image closes it; another button opens it in a new tab.
const props = defineProps<{
  /** Its address (`/files/…`, or any image's). Null: nothing shown. */
  src: string | null
  /** Its name, the viewer's title. */
  name: string
  /** Under the name (its size, from the side panel's Files). */
  description?: string
}>()
const open = defineModel<boolean>('open', { required: true })

// The viewer takes the focus itself, not its first button: that button's tooltip would show.
function focusViewer(event: Event) {
  event.preventDefault()
  ;(event.target as HTMLElement).focus()
}

// A click around the image (not on it) closes, as a click outside a window would.
function closeOutside(event: MouseEvent) {
  if (event.target === event.currentTarget) open.value = false
}

const label = computed(() => props.name || 'Image')
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :title="label"
    :description="description"
    :content="{ onOpenAutoFocus: focusViewer }"
    :ui="{
      header: 'min-h-0 py-2.5 sm:py-2.5',
      body: 'flex min-h-0 p-0 sm:p-0',
      close: 'static',
    }"
    data-testid="image-viewer"
  >
    <!-- Its close button in the header's row, after the new-tab one: both centered on it. -->
    <template #actions>
      <UTooltip v-if="src" text="Open in a new tab">
        <UButton
          :to="src"
          external
          target="_blank"
          icon="i-lucide-external-link"
          color="neutral"
          variant="ghost"
          aria-label="Open in a new tab"
          class="ms-auto"
        />
      </UTooltip>
    </template>
    <template #body>
      <div class="flex size-full items-center justify-center p-3 sm:p-6" @click="closeOutside">
        <img
          v-if="src"
          :src="src"
          :alt="label"
          class="max-h-full max-w-full object-contain"
          data-testid="image-preview"
        />
      </div>
    </template>
  </UModal>
</template>
