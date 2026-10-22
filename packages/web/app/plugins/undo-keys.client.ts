// ⌘Z and ⌘⇧Z (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y elsewhere) everywhere in the app: the shared
// history (useUndo), which a note's editor is part of. A text field being typed in keeps its
// own undo while its text differs from what it had when it got the focus (and its redo after
// that undo, until typed in again); then the keys go to the history. Taken before anything else sees them (the editor has its own keys for them).
import { isMac } from '~/utils/platform-keys'
import type { UndoStep } from '~/utils/undo-history'

/** A field's text when it got the focus (or after the history last changed it). */
const valueAtFocus = new WeakMap<Element, string>()
/** Fields whose own undo was used since they were last typed in: ⌘⇧Z redoes there. */
const undoneInField = new WeakSet<Element>()

function isTextField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      ['text', 'search', 'url', 'email', 'number', 'tel', 'password', ''].includes(element.type))
  )
}

function remember(element: Element | null) {
  if (!isTextField(element)) return
  valueAtFocus.set(element, element.value)
  undoneInField.delete(element)
}

export default defineNuxtPlugin(() => {
  const history = useUndo()
  const toast = useToast()
  const tree = useTree()
  const router = useRouter()

  document.addEventListener('focusin', (event) => remember(event.target as Element), true)
  document.addEventListener(
    'input',
    (event) => {
      const type = (event as InputEvent).inputType ?? ''
      if (!type.startsWith('history')) undoneInField.delete(event.target as Element)
    },
    true,
  )

  /** A step undone or redone in another note than the one shown: says where. */
  function tell(step: UndoStep, action: 'Undone' | 'Redone') {
    const route = router.currentRoute.value
    const shown = route.path.startsWith('/notes/') ? String(route.params.id) : null
    if (!step.noteId || step.noteId === shown) return
    const title = tree.byId.value.get(step.noteId)?.title
    toast.add({
      title: `${action}: ${step.label}`,
      description: title ? `In “${title}”.` : undefined,
      icon: action === 'Undone' ? 'i-lucide-undo-2' : 'i-lucide-redo-2',
    })
  }

  window.addEventListener(
    'keydown',
    (event) => {
      const mac = isMac()
      if (!(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return
      if (event.altKey || event.isComposing) return
      const key = event.key.toLowerCase()
      const isUndo = key === 'z' && !event.shiftKey
      const isRedo = (key === 'z' && event.shiftKey) || (!mac && key === 'y' && !event.shiftKey)
      if (!isUndo && !isRedo) return
      const field = event.target instanceof Element ? event.target : null
      if (isTextField(field) && !field.readOnly) {
        if (isUndo && field.value !== valueAtFocus.get(field)) {
          undoneInField.add(field)
          return
        }
        if (isRedo && undoneInField.has(field)) return
      }
      event.preventDefault()
      event.stopPropagation()
      void (isUndo ? history.undo() : history.redo()).then(async (step) => {
        if (!step) return
        if (!step.editor) tell(step, isUndo ? 'Undone' : 'Redone')
        // The field shows what the history put back: its own undo starts from there.
        await nextTick()
        remember(document.activeElement)
      })
    },
    true,
  )
})
