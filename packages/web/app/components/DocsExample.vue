<script setup lang="ts">
// A piece of Markdown shown by the note editor, read-only (Docs › Blocks): the same extensions
// and node views as NoteEditor, so the tour shows exactly what a note shows.
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import CalloutView from '~/components/editor/CalloutView.vue'
import CodeBlockView from '~/components/editor/CodeBlockView.vue'
import { Callout } from '~/editor/callout'
import { createExtensions, starterKitOptions } from '~/editor/extensions'

defineProps<{ markdown: string }>()

const extensions = createExtensions().map((extension) => {
  if (extension.name === CodeBlockLowlight.name) {
    return (extension as typeof CodeBlockLowlight).extend({
      addNodeView: () => VueNodeViewRenderer(CodeBlockView),
    })
  }
  if (extension.name === Callout.name) {
    return Callout.extend({ addNodeView: () => VueNodeViewRenderer(CalloutView) })
  }
  return extension
})
</script>

<template>
  <div class="note-editor docs-example">
    <UEditor
      :model-value="markdown"
      :editable="false"
      content-type="markdown"
      :starter-kit="starterKitOptions"
      :image="false"
      :mention="false"
      :extensions="extensions"
      class="w-full"
      :ui="{ base: '*:my-3 sm:px-0' }"
    />
  </div>
</template>
