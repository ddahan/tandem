<script setup lang="ts">
defineEmits<{ keepMine: []; takeTheirs: []; compare: [] }>()
</script>

<template>
  <UAlert
    color="warning"
    variant="subtle"
    icon="i-lucide-git-compare"
    title="This note was changed elsewhere while you were editing"
    description="Your latest changes are not saved. Choose which version to keep."
    :actions="[
      {
        label: 'Compare',
        color: 'neutral',
        variant: 'outline',
        icon: 'i-lucide-columns-2',
        onClick: () => $emit('compare'),
      },
      {
        label: 'Take theirs',
        color: 'neutral',
        variant: 'outline',
        onClick: () => $emit('takeTheirs'),
      },
      { label: 'Keep mine', color: 'warning', onClick: () => $emit('keepMine') },
    ]"
    orientation="horizontal"
  />
</template>
