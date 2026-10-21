<script setup lang="ts">
import { formatDateTime, type TrashItem } from '@tandem/shared'

const api = useApi()
const toast = useToast()
const confirm = useConfirm()
const showError = useApiErrorToast()

const items = ref<TrashItem[]>([])
const load = async () => {
  items.value = await unwrap(api.trash.$get()).catch(() => [])
}
await load()
useServerEvents((event) => {
  if (event.type === 'trash' || event.type === 'resync') void load()
})
useHead({ title: 'Trash' })

// Off (Settings › Features), the page stays reachable (an open tab, an address): it says so.
const { settings } = useSettings()
const off = [
  {
    label: 'Settings',
    to: '/settings/features',
    color: 'neutral' as const,
    variant: 'outline' as const,
  },
]

async function restore(item: TrashItem) {
  try {
    const node = await unwrap(api.trash[':id'].restore.$post({ param: { id: item.id } }))
    toast.add({
      title: `“${node.title}” restored`,
      icon: 'i-lucide-undo-2',
      actions: [{ label: 'Open', to: `/notes/${node.id}` }],
    })
    await load()
  } catch (error) {
    showError(error, 'Could not restore')
  }
}

async function deleteForever(item: TrashItem) {
  const ok = await confirm({
    title: `Delete “${item.title}” forever?`,
    description: 'Its files, attachments and history are deleted. This cannot be undone.',
    confirmLabel: 'Delete forever',
    confirmColor: 'error',
    icon: 'i-lucide-trash-2',
  })
  if (!ok) return
  try {
    await unwrap(api.trash[':id'].$delete({ param: { id: item.id } }))
    await load()
  } catch (error) {
    showError(error)
  }
}

async function emptyTrash() {
  const ok = await confirm({
    title: 'Empty the trash?',
    description: `${items.value.length} item${items.value.length > 1 ? 's' : ''} will be deleted forever, with their attachments and history. This cannot be undone.`,
    confirmLabel: 'Empty trash',
    confirmColor: 'error',
    icon: 'i-lucide-trash-2',
  })
  if (!ok) return
  try {
    await unwrap(api.trash.$delete())
    await load()
  } catch (error) {
    showError(error)
  }
}
</script>

<template>
  <UDashboardPanel id="trash">
    <template #header>
      <PageNavbar title="Trash">
        <template #right>
          <UButton
            v-if="items.length"
            label="Empty trash"
            icon="i-lucide-trash-2"
            color="error"
            variant="soft"
            size="sm"
            @click="emptyTrash"
          />
        </template>
      </PageNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl py-4">
        <UAlert
          v-if="!settings.trash"
          class="mb-6"
          color="neutral"
          variant="subtle"
          icon="i-lucide-eye-off"
          title="The trash is turned off"
          description="Pages you delete now are deleted forever. Those below were deleted before: restore them, or delete them. Turn the trash on in Settings › Features."
          :actions="off"
        />
        <p class="mb-6 text-sm text-muted">
          Deleted pages stay here, with their child pages, attachments and history, until you delete
          them.
        </p>
        <div v-if="items.length" class="divide-y divide-default rounded-lg border border-default">
          <div
            v-for="item in items"
            :key="item.id"
            class="flex items-center gap-3 px-4 py-3"
            data-testid="trash-item"
          >
            <UIcon
              :name="item.kind === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text'"
              class="size-5 shrink-0 text-dimmed"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-default">{{ item.title }}</p>
              <p class="truncate text-xs text-dimmed">
                {{ item.originalPath.replace(/\.md$/, '') }} · deleted
                {{ formatDateTime(item.deletedAt) }}
                <template v-if="item.pageCount > 1"> · {{ item.pageCount }} pages</template>
              </p>
            </div>
            <UButton
              label="Restore"
              icon="i-lucide-undo-2"
              color="neutral"
              variant="outline"
              size="sm"
              @click="restore(item)"
            />
            <UTooltip text="Delete forever">
              <UButton
                icon="i-lucide-x"
                color="error"
                variant="ghost"
                size="sm"
                aria-label="Delete forever"
                @click="deleteForever(item)"
              />
            </UTooltip>
          </div>
        </div>
        <UEmpty
          v-else
          icon="i-lucide-trash"
          title="The trash is empty"
          description="Deleted pages appear here."
          class="mt-10"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
