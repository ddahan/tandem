<script setup lang="ts">
// A confirmation dialog, opened with `useConfirm()`.
withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
    confirmColor?: 'primary' | 'error' | 'warning'
    icon?: string
  }>(),
  { confirmLabel: 'Confirm', confirmColor: 'primary', description: undefined, icon: undefined },
)
const emit = defineEmits<{ close: [confirmed: boolean] }>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :close="false"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="emit('close', false)" />
        <UButton
          :label="confirmLabel"
          :color="confirmColor"
          :icon="icon"
          autofocus
          @click="emit('close', true)"
        />
      </div>
    </template>
  </UModal>
</template>
