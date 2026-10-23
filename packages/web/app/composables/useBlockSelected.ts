// Whether an atom block (database, bookmark card) shows itself selected. A note that starts
// with one has it selected from the start (the editor's selection begins on its first block):
// shown only once the editor has had the focus, it is selected by what the owner did (a click,
// the keyboard, the block handle), not by opening the note.
import type { Editor } from '@tiptap/core'

export function useBlockSelected(editor: Editor, selected: () => boolean) {
  const focused = ref(editor.isFocused)
  const onFocus = () => (focused.value = true)
  editor.on('focus', onFocus)
  onBeforeUnmount(() => editor.off('focus', onFocus))
  return computed(() => selected() && focused.value)
}
