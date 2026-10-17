import { describe, expect, it } from 'vitest'
import { accentShade, logoSvg } from '../app/utils/logo'

describe('logo', () => {
  it('is drawn in the accent color', () => {
    const svg = logoSvg(accentShade, 'x')
    expect(svg).toContain('stop-color:var(--ui-color-primary-400)')
    expect(svg).toContain('fill:var(--ui-color-primary-500)')
    expect(svg).toContain('id="x-bg"')
  })
})
