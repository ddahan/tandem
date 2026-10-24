<script setup lang="ts">
// Which days of a repeating event a change or a deletion is for: the one it was made on, or all
// of them from today on (past days stay as they were). Opened by useAgendaActions.
const props = defineProps<{ action: 'change' | 'delete' }>()
const emit = defineEmits<{ close: [scope: 'one' | 'all' | null] }>()
const title = computed(() =>
  props.action === 'delete' ? 'Delete a repeating event' : 'Change a repeating event',
)
</script>

<template>
  <UModal
    :title="title"
    description="Past days stay as they were."
    :close="false"
    @update:open="(open) => !open && emit('close', null)"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('close', null)" />
        <UButton
          label="This one"
          color="neutral"
          variant="outline"
          data-testid="scope-one"
          @click="emit('close', 'one')"
        />
        <UButton
          label="All from today"
          :color="action === 'delete' ? 'error' : 'primary'"
          autofocus
          data-testid="scope-all"
          @click="emit('close', 'all')"
        />
      </div>
    </template>
  </UModal>
</template>
