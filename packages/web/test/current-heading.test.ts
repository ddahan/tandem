import { describe, expect, it } from 'vitest'
import { currentHeading } from '../app/utils/current-heading'

// A 400px tall area at the top of the screen: the reading line is at 100px, until the end.
const view = (scrollTop: number, scrollHeight = 2000) => ({
  top: 0,
  height: 400,
  scrollTop,
  scrollHeight,
})

describe('current heading', () => {
  it('is the last heading above the reading line', () => {
    expect(currentHeading([150, 600], view(0))).toBe(-1)
    expect(currentHeading([80, 600], view(0))).toBe(0)
    expect(currentHeading([-500, 100, 600], view(500))).toBe(1)
    expect(currentHeading([-500, -100, 101], view(500))).toBe(2)
    expect(currentHeading([], view(0))).toBe(-1)
  })

  it('reaches the last sections at the end of the note', () => {
    // 1600px of scrolling: the line starts sliding 300px before the end.
    const tops = [-900, 200, 300]
    expect(currentHeading(tops, view(1300))).toBe(0)
    expect(currentHeading(tops, view(1450))).toBe(1)
    expect(currentHeading(tops, view(1600))).toBe(2)
  })

  it("keeps the line in place in a note that doesn't scroll", () => {
    expect(currentHeading([50, 200, 300], view(0, 400))).toBe(0)
  })

  it('slides the line over what little a short note scrolls', () => {
    expect(currentHeading([50, 200, 300], view(0, 420))).toBe(0)
    expect(currentHeading([50, 200, 300], view(20, 420))).toBe(2)
  })
})
