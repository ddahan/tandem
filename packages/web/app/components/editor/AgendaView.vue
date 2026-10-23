<script setup lang="ts">
// A day's agenda block: the day's events that aren't placed in the note (repeats, feeds', those
// added from the palette or by agents), one line each (AgendaLine), dragged into the note to
// place them there (editor/event.ts). Events typed in the note are placed where typed. With
// nothing left to show, the block shows nothing.
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { checkRef } from '@tandem/shared'
import AgendaLine from './AgendaLine.vue'
import { placedEvents } from '~/editor/event'

const props = defineProps(nodeViewProps)

const date = computed(() => (props.extension.options.date as () => string | null)())
const editable = computed(() => props.editor.isEditable)
const { items } = useAgendaDays(() => (date.value ? { from: date.value, to: date.value } : null))
const selected = useBlockSelected(props.editor, () => props.selected)

// The events placed in the note, followed as it changes.
const placed = ref(placedEvents(props.editor.state.doc))
function follow() {
  placed.value = placedEvents(props.editor.state.doc)
}
props.editor.on('update', follow)
onBeforeUnmount(() => props.editor.off('update', follow))

const rest = computed(() => items.value.filter((item) => !placed.value.has(checkRef(item))))
const visible = computed(() => !!date.value && rest.value.length > 0)
</script>

<template>
  <NodeViewWrapper
    class="agenda-block"
    :class="[visible ? 'my-3' : 'hidden', selected && 'is-selected']"
    contenteditable="false"
    data-testid="agenda"
    :data-date="date"
  >
    <!-- Not a list: the editor's lists are indented, these lines start where the text does. -->
    <div v-if="visible" class="space-y-0.5" role="list">
      <AgendaLine
        v-for="item in rest"
        :key="item.key"
        :item="item"
        :editable="editable"
        draggable
        role="listitem"
      />
    </div>
  </NodeViewWrapper>
</template>
