// An undo history: steps done, undone and redone in order, one at a time. The app has one
// (useUndo); this is its logic, without the app.

export interface UndoStep {
  /** What was done, for messages: “Delete a row”. */
  label: string
  /** The note it was done in, if any: undone from another one, a message says so. */
  noteId?: string
  /** False (or an error) when it couldn't be done: the step is dropped. */
  undo: () => Promise<boolean | void> | boolean | void
  redo: () => Promise<boolean | void> | boolean | void
  /** For a note's text: its editor (whose history holds the step). */
  editor?: object
}

export function createUndoHistory(options: {
  /** Steps kept; older ones are forgotten. */
  limit: number
  /** A step that failed (its error). */
  onError: (error: unknown, step: UndoStep, action: 'undo' | 'redo') => void
}) {
  const done: UndoStep[] = []
  const undone: UndoStep[] = []
  const listeners = new Set<(step: UndoStep) => void>()
  let queue: Promise<unknown> = Promise.resolve()
  let replaying = false

  /** Runs `task` after the steps being undone or redone. */
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task)
    queue = run.catch(() => {})
    return run
  }

  async function attempt(step: UndoStep, action: 'undo' | 'redo') {
    replaying = true
    try {
      return (await step[action]()) !== false
    } catch (error) {
      options.onError(error, step, action)
      return false
    } finally {
      replaying = false
    }
  }

  return {
    /** Records a step just done (nothing while one is undone or redone: that's the step). */
    record(step: UndoStep) {
      if (replaying) return
      done.push(step)
      if (done.length > options.limit) done.shift()
      undone.length = 0
      for (const listener of listeners) listener(step)
    },

    /** Undoes the last step: it, or null when there was none (or it failed). */
    undo(): Promise<UndoStep | null> {
      return enqueue(async () => {
        const step = done.pop()
        if (!step) return null
        if (!(await attempt(step, 'undo'))) return null
        undone.push(step)
        return step
      })
    },

    redo(): Promise<UndoStep | null> {
      return enqueue(async () => {
        const step = undone.pop()
        if (!step) return null
        if (!(await attempt(step, 'redo'))) return null
        done.push(step)
        return step
      })
    },

    /**
     * Undoes this step, wherever it is (an "Undo" in a message): the last one as ⌘Z would; an
     * older one leaves the history.
     */
    revert(step: UndoStep): Promise<boolean> {
      return enqueue(async () => {
        const index = done.indexOf(step)
        if (index < 0) return false
        done.splice(index, 1)
        const ok = await attempt(step, 'undo')
        if (ok && index === done.length) undone.push(step)
        return ok
      })
    },

    /** Forgets an editor's steps (its note closed: its history went with it). */
    forget(editor: object) {
      for (const steps of [done, undone]) {
        for (let i = steps.length - 1; i >= 0; i--) {
          if (steps[i]!.editor === editor) steps.splice(i, 1)
        }
      }
    },

    /** Calls `listener` with each step recorded, until the returned function is called. */
    onRecord(listener: (step: UndoStep) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    /** Whether a step is being undone or redone (changes then aren't new steps). */
    isReplaying: () => replaying,

    /** The steps ⌘Z and ⌘⇧Z would take, next first. */
    steps: () => ({ done: done.toReversed(), undone: undone.toReversed() }),
  }
}

export type UndoHistory = ReturnType<typeof createUndoHistory>
