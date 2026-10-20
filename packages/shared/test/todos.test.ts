import { describe, expect, it } from 'vitest'
import { findTodos, todoRanges } from '../src/todos.ts'

describe('TODOs', () => {
  it('finds TODO: in capitals, to the end of its line', () => {
    expect(
      findTodos('Intro\n\nTODO: please remind to do this.\n\n- item TODO: call Ann  \n'),
    ).toEqual([
      { text: 'please remind to do this.', line: 3 },
      { text: 'call Ann', line: 5 },
    ])
  })

  it('needs the capitals and the colon, and no word glued before', () => {
    expect(findTodos('todo: no\nTodo: no\nTODO no\nmyTODO: no\nTODOfoo: no\n(TODO: yes)')).toEqual([
      { text: 'yes)', line: 6 },
    ])
  })

  it('ignores code, inline or fenced', () => {
    expect(findTodos('`TODO: no`\n\n```ts\n// TODO: no\n```\n\nTODO: yes')).toEqual([
      { text: 'yes', line: 7 },
    ])
  })

  it('splits two TODOs on one line, and reads formatting as plain text', () => {
    expect(
      findTodos(
        'TODO: ask **Bob** about [[Projects/Plan|the plan]] TODO: read [docs](https://x.y)',
      ),
    ).toEqual([
      { text: 'ask Bob about the plan', line: 1 },
      { text: 'read docs', line: 1 },
    ])
  })

  it('gives ranges from the marker to the end of the line, without trailing spaces', () => {
    expect(todoRanges('a TODO: b  \nc')).toEqual([{ start: 2, end: 9 }])
    expect(todoRanges('TODO:')).toEqual([{ start: 0, end: 5 }])
  })
})
