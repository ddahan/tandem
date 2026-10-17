<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { CALLOUT_TYPES, type CalloutType } from '~/editor/callout'

const props = defineProps(nodeViewProps)

const META: Record<CalloutType, { label: string; icon: string }> = {
  note: { label: 'Note', icon: 'i-lucide-info' },
  tip: { label: 'Tip', icon: 'i-lucide-lightbulb' },
  important: { label: 'Important', icon: 'i-lucide-message-square-warning' },
  warning: { label: 'Warning', icon: 'i-lucide-triangle-alert' },
  caution: { label: 'Caution', icon: 'i-lucide-octagon-alert' },
}

const type = computed(() => (props.node.attrs.type as CalloutType) ?? 'note')

const items = computed<DropdownMenuItem[]>(() =>
  CALLOUT_TYPES.map((value) => ({
    label: META[value].label,
    icon: META[value].icon,
    type: 'checkbox' as const,
    checked: value === type.value,
    onSelect: () => props.updateAttributes({ type: value }),
  })),
)
</script>

<template>
  <NodeViewWrapper class="callout" :data-callout="type">
    <div contenteditable="false" class="mb-1 flex items-center">
      <UDropdownMenu :items="items" :disabled="!editor.isEditable" :content="{ align: 'start' }">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded text-sm font-semibold text-(--callout) hover:opacity-80"
        >
          <UIcon :name="META[type].icon" class="size-4" />
          {{ META[type].label }}
        </button>
      </UDropdownMenu>
    </div>
    <NodeViewContent class="[&>*+*]:mt-3" />
  </NodeViewWrapper>
</template>
