// @vitest-environment happy-dom
// The note's own attachments in its document (file chips, images), and files deleted for good:
// nothing (undo, redo, a paste) brings their links back (DeletedFiles).
import { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions, starterKitOptions } from '../app/editor/extensions'
import {
  attachmentNames,
  deletedFilesKey,
  fileDeletedChange,
  type DeletedFilesMeta,
} from '../app/editor/file-chips'
import { normalizeMarkdown } from '../app/utils/markdown-paths'

const PREFIX = '/files/A/My%20note.assets/'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function setup(markdown: string) {
  editor = new Editor({
    extensions: [
      StarterKit.configure(starterKitOptions),
      Markdown,
      ...createExtensions({ assetsPrefix: () => PREFIX }),
    ],
    content: markdown,
    contentType: 'markdown',
  })
  return editor
}

const NOTE = [
  'Intro.',
  '',
  `![pic.png](${PREFIX}pic.png)`,
  '',
  `A file: [report.pdf](${PREFIX}report.pdf) end`,
  '',
  `![other.png](${PREFIX}other.png)`,
].join('\n')

const linked = (e: Editor) => [...attachmentNames(e.state.doc, PREFIX)].toSorted()
const text = (e: Editor) => e.state.doc.textContent
/** A new undo step from here on (the history groups changes close in time). */
const newStep = (e: Editor) => e.view.dispatch(closeHistory(e.state.tr))
const mark = (e: Editor, meta: DeletedFilesMeta) =>
  e.view.dispatch(e.state.tr.setMeta(deletedFilesKey, meta).setMeta('addToHistory', false))

/** Removes what links to or shows `name` (as the keys would), as one undo step. */
function removeLinksTo(e: Editor, name: string) {
  const ranges: [number, number][] = []
  e.state.doc.descendants((node, pos) => {
    const href = node.type.name === 'image' ? node.attrs.src : node.marks[0]?.attrs.href
    if (href === `${PREFIX}${name}`) ranges.push([pos, pos + node.nodeSize])
  })
  const tr = e.state.tr
  for (const [from, to] of ranges.toReversed()) tr.delete(from, to)
  e.view.dispatch(tr)
  newStep(e)
}

it('lists the attachments of the note’s own folder, by name', () => {
  const e = setup(
    '[report 1.pdf](/files/A/My%20note.assets/report%201.pdf) ' +
      '[other](/files/A/Other.assets/x.pdf) [site](https://example.com)\n\n' +
      '![a](/files/A/My%20note.assets/a.png)',
  )
  expect([...attachmentNames(e.state.doc, PREFIX)]).toEqual(['report 1.pdf', 'a.png'])
})

describe('a file deleted for good', () => {
  it('doesn’t come back with undo, nor redo', () => {
    const e = setup(NOTE)
    removeLinksTo(e, 'pic.png')
    mark(e, { deleted: ['pic.png'] })
    e.commands.undo()
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
    e.commands.redo()
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
    e.commands.undo()
    e.commands.undo()
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
    expect(text(e)).toContain('Intro.')
  })

  it('takes nothing else of the step undone with it: typed text comes back', () => {
    const e = setup(NOTE)
    newStep(e)
    // One step: the image removed, then words typed (close in time).
    const tr = e.state.tr
    e.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image' && node.attrs.src === `${PREFIX}pic.png`) {
        tr.delete(pos, pos + node.nodeSize)
      }
    })
    tr.insertText(' and more', 'Intro.'.length + 1)
    e.view.dispatch(tr)
    mark(e, { deleted: ['pic.png'] })
    e.commands.undo()
    expect(text(e)).not.toContain('and more')
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
  })

  it('leaves the steps before it whole: text typed after the image is undone next', () => {
    // The image first, the typing after it: positions after the image shift when it goes.
    const e = setup(`![pic.png](${PREFIX}pic.png)\n\nIntro.`)
    newStep(e)
    e.commands.insertContentAt(e.state.doc.content.size - 1, ' Typed.')
    newStep(e)
    removeLinksTo(e, 'pic.png')
    mark(e, { deleted: ['pic.png'] })
    e.commands.undo()
    expect(linked(e)).toEqual([])
    expect(text(e)).toBe('Intro. Typed.')
    e.commands.undo()
    expect(text(e)).toBe('Intro.')
    expect(linked(e)).toEqual([])
    e.commands.redo()
    expect(text(e)).toBe('Intro. Typed.')
    e.commands.redo()
    expect(text(e)).toBe('Intro. Typed.')
    expect(linked(e)).toEqual([])
  })

  it('takes a chip’s text with it, the line’s other words stay', () => {
    const e = setup(NOTE)
    removeLinksTo(e, 'report.pdf')
    mark(e, { deleted: ['report.pdf'] })
    e.commands.undo()
    expect(linked(e)).toEqual(['other.png', 'pic.png'])
    expect(text(e)).toContain('A file:')
    expect(text(e)).toContain('end')
    expect(text(e)).not.toContain('report.pdf')
  })

  it('leaves other files alone: their removal is undone', () => {
    const e = setup(NOTE)
    removeLinksTo(e, 'pic.png')
    mark(e, { deleted: ['pic.png'] })
    removeLinksTo(e, 'other.png')
    expect(linked(e)).toEqual(['report.pdf'])
    e.commands.undo()
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
    e.commands.undo()
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
  })

  it('doesn’t come back with a paste or an insert', () => {
    const e = setup(NOTE)
    removeLinksTo(e, 'pic.png')
    mark(e, { deleted: ['pic.png'] })
    e.commands.insertContentAt(1, {
      type: 'image',
      attrs: { src: `${PREFIX}pic.png`, alt: 'pic.png' },
    })
    e.commands.insertContentAt(1, {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'pic.png',
          marks: [{ type: 'link', attrs: { href: `${PREFIX}pic.png` } }],
        },
      ],
    })
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
  })

  it('may come back under its name as a new file (uploaded again)', () => {
    const e = setup(NOTE)
    removeLinksTo(e, 'pic.png')
    mark(e, { deleted: ['pic.png'] })
    mark(e, { restored: ['pic.png'] })
    e.commands.insertContentAt(1, { type: 'image', attrs: { src: `${PREFIX}pic.png` } })
    expect(linked(e)).toEqual(['other.png', 'pic.png', 'report.pdf'])
  })

  it('stays in content replaced from outside (the file on disk, an agent): there again', () => {
    const e = setup(NOTE)
    removeLinksTo(e, 'pic.png')
    mark(e, { deleted: ['pic.png'] })
    e.commands.setContent(NOTE, { contentType: 'markdown', emitUpdate: false })
    expect(linked(e)).toEqual(['other.png', 'pic.png', 'report.pdf'])
    // A new file under that name: it stays through what follows.
    e.commands.insertContentAt(1, 'More ')
    expect(linked(e)).toEqual(['other.png', 'pic.png', 'report.pdf'])
  })

  it('changes nothing while no file was deleted', () => {
    const e = setup(NOTE)
    removeLinksTo(e, 'pic.png')
    e.commands.undo()
    expect(linked(e)).toEqual(['other.png', 'pic.png', 'report.pdf'])
  })
})

const deleteFromPanel = (e: Editor, name: string) =>
  e.view.dispatch(fileDeletedChange(e.state, name, PREFIX))
/** What the app saves. */
const saved = (e: Editor) => normalizeMarkdown(e.getMarkdown())

describe('a file deleted from the Files panel', () => {
  it('leaves the note at once, its chips’ text too, the other words staying', () => {
    const e = setup(NOTE)
    deleteFromPanel(e, 'pic.png')
    deleteFromPanel(e, 'report.pdf')
    expect(linked(e)).toEqual(['other.png'])
    expect(text(e)).toContain('A file:')
    expect(text(e)).not.toContain('report.pdf')
  })

  it('makes no undo step: undo goes on with the typing before it, never with the image', () => {
    const e = setup(NOTE)
    newStep(e)
    e.commands.insertContentAt('Intro.'.length + 1, ' Typed.')
    newStep(e)
    deleteFromPanel(e, 'pic.png')
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
    e.commands.undo()
    expect(text(e)).not.toContain('Typed.')
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
    e.commands.redo()
    expect(text(e)).toContain('Intro. Typed.')
    expect(linked(e)).toEqual(['other.png', 'report.pdf'])
    // As many undos and redos as there are: never the image.
    for (const step of ['undo', 'undo', 'redo', 'redo', 'undo'] as const) {
      e.commands[step]()
      expect(linked(e)).not.toContain('pic.png')
    }
  })

  it('doesn’t come back with the redo of the step that added it', () => {
    const e = setup('Intro.')
    newStep(e)
    e.commands.insertContentAt(e.state.doc.content.size, {
      type: 'image',
      attrs: { src: `${PREFIX}pic.png`, alt: 'pic.png' },
    })
    newStep(e)
    deleteFromPanel(e, 'pic.png')
    expect(linked(e)).toEqual([])
    e.commands.undo()
    e.commands.redo()
    expect(linked(e)).toEqual([])
    expect(text(e)).toBe('Intro.')
  })

  it('leaves no empty line where the image was', () => {
    const e = setup(NOTE)
    deleteFromPanel(e, 'pic.png')
    expect(saved(e)).toBe(
      `Intro.\n\nA file: [report.pdf](${PREFIX}report.pdf) end\n\n![other.png](${PREFIX}other.png)\n`,
    )
  })

  it('only marks a file the note doesn’t link to: a link to it can’t be added after', () => {
    const e = setup(NOTE)
    const before = saved(e)
    deleteFromPanel(e, 'kept.txt')
    expect(saved(e)).toBe(before)
    e.commands.insertContentAt(1, {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'kept.txt',
          marks: [{ type: 'link', attrs: { href: `${PREFIX}kept.txt` } }],
        },
      ],
    })
    expect(linked(e)).not.toContain('kept.txt')
  })
})
