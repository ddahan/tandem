// A key acts where the cursor is. A click moves the browser's cursor at once, but ProseMirror
// learns of it only from the `selectionchange` event, which comes later, as a task of its own;
// a busy page can run the next keys first (Chromium gives input priority), and they then act
// on the cursor from before the click: typing lands there, and the editor draws the cursor
// back there. Before any key, this reads the browser's cursor if it moved since ProseMirror
// last looked, as that event would have (ProseMirror's own handler, run early).
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/** ProseMirror's internals used here (not in its types). */
interface ViewInternals {
  domSelectionRange(): unknown
  domObserver?: {
    /** The browser's selection as ProseMirror last saw it. */
    currentSelection: { eq(selection: unknown): boolean }
    /** What ProseMirror runs on `selectionchange`. */
    onSelectionChange(): void
  }
}

/** Takes the browser's cursor into the editor when ProseMirror hasn't seen it move yet. */
export function syncDomSelection(view: EditorView) {
  const internals = view as unknown as ViewInternals
  const observer = internals.domObserver
  if (!observer || view.composing || !view.hasFocus()) return
  if (observer.currentSelection.eq(internals.domSelectionRange())) return
  observer.onSelectionChange()
}

export const DomSelection = Extension.create({
  name: 'domSelection',
  // Before every other key handler, which all read the editor's selection.
  priority: 10000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('domSelection'),
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              // 229: a key that is part of a composition (IME), which ProseMirror leaves alone.
              if (event.keyCode !== 229) syncDomSelection(view)
              return false
            },
          },
        },
      }),
    ]
  },
})
