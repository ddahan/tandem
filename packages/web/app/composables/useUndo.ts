// The app's undo history: what ⌘Z undoes and ⌘⇧Z redoes, in the order things were done,
// whatever they were done to (a note's text, a database, the pages, bookmarks). A note's text
// steps stay in its editor's own history; this one keeps their place among the others. One
// for the app, in memory only: a reload starts a new one. The keys are routed by
// `plugins/undo-keys.client.ts`; the logic is in `utils/undo-history.ts`.
import { createUndoHistory, type UndoHistory, type UndoStep } from '~/utils/undo-history'

export type { UndoStep }

let history: UndoHistory | undefined

export function useUndo(): UndoHistory {
  if (!history) {
    // Taken here, in a component or plugin: steps run later, out of one.
    const showError = useApiErrorToast()
    history = createUndoHistory({
      limit: 1000,
      onError: (error, step, action) => showError(error, `Could not ${action} “${step.label}”`),
    })
  }
  return history
}
