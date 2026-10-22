// The undo history: steps undone and redone in order, one at a time, whatever they change.
import { describe, expect, it, vi } from 'vitest'
import { createUndoHistory, type UndoStep } from '../app/utils/undo-history'

function setup(limit = 100) {
  const errors: string[] = []
  const history = createUndoHistory({
    limit,
    onError: (_error, step, action) => errors.push(`${action} ${step.label}`),
  })
  let value = 0
  /** A step that adds `n` to `value`. */
  const add = (n: number, extra: Partial<UndoStep> = {}): UndoStep => {
    value += n
    const step: UndoStep = {
      label: `add ${n}`,
      undo: () => {
        value -= n
      },
      redo: async () => {
        value += n
      },
      ...extra,
    }
    history.record(step)
    return step
  }
  return { history, add, errors, value: () => value }
}

describe('undo history', () => {
  it('undoes and redoes in order; a new step forgets what was undone', async () => {
    const { history, add, value } = setup()
    add(1)
    add(10)
    expect((await history.undo())?.label).toBe('add 10')
    expect(value()).toBe(1)
    await history.undo()
    expect(value()).toBe(0)
    expect(await history.undo()).toBeNull()
    await history.redo()
    expect(value()).toBe(1)
    add(100)
    expect(await history.redo()).toBeNull()
    expect(history.steps().done.map((step) => step.label)).toEqual(['add 100', 'add 1'])
  })

  it('runs steps one at a time, and records nothing while one runs', async () => {
    const { history, add } = setup()
    const order: string[] = []
    const slow = (label: string, ms: number): UndoStep => ({
      label,
      undo: async () => {
        await new Promise((resolve) => setTimeout(resolve, ms))
        order.push(label)
        // Changes made by undoing aren't steps of their own.
        add(5)
      },
      redo: () => {},
    })
    history.record(slow('first', 1))
    history.record(slow('second', 20))
    await Promise.all([history.undo(), history.undo()])
    expect(order).toEqual(['second', 'first'])
    expect(history.steps().done).toEqual([])
  })

  it('drops a step that fails, and says so', async () => {
    const { history, add, errors } = setup()
    add(1)
    history.record({
      label: 'broken',
      undo: () => {
        throw new Error('gone')
      },
      redo: () => {},
    })
    history.record({ label: 'refused', undo: () => false, redo: () => {} })
    expect(await history.undo()).toBeNull()
    expect(await history.undo()).toBeNull()
    expect(errors).toEqual(['undo broken'])
    expect((await history.undo())?.label).toBe('add 1')
  })

  it("reverts a step from a message's Undo, the last one or an older one", async () => {
    const { history, add, value } = setup()
    const first = add(1)
    const second = add(10)
    expect(await history.revert(second)).toBe(true)
    // The last one: redone by ⌘⇧Z.
    await history.redo()
    expect(value()).toBe(11)
    expect(await history.revert(first)).toBe(true)
    expect(value()).toBe(10)
    expect(history.steps().done.map((step) => step.label)).toEqual(['add 10'])
    expect(await history.revert(first)).toBe(false)
  })

  it("keeps the last steps, forgets a closed editor's, and tells listeners", async () => {
    const { history, add } = setup(2)
    const listener = vi.fn<(step: UndoStep) => void>()
    const stop = history.onRecord(listener)
    const editor = {}
    add(1)
    add(2, { editor })
    add(3)
    expect(history.steps().done.map((step) => step.label)).toEqual(['add 3', 'add 2'])
    history.forget(editor)
    expect(history.steps().done.map((step) => step.label)).toEqual(['add 3'])
    expect(listener).toHaveBeenCalledTimes(3)
    stop()
    add(4)
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
