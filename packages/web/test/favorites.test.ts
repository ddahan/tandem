import { describe, expect, it } from 'vitest'
import { placeFavorites, removeFavorite, stepFavorite } from '../app/utils/favorites'

describe('favorites order', () => {
  it('adds pages at a place, or at the end', () => {
    expect(placeFavorites(['a', 'b'], ['c'])).toEqual(['a', 'b', 'c'])
    expect(placeFavorites(['a', 'b'], ['c'], 0)).toEqual(['c', 'a', 'b'])
    expect(placeFavorites(['a', 'b'], ['c', 'd'], 1)).toEqual(['a', 'c', 'd', 'b'])
    expect(placeFavorites([], ['c'], 5)).toEqual(['c'])
  })

  it('moves those already there, the index counted among the others', () => {
    expect(placeFavorites(['a', 'b', 'c'], ['a'], 2)).toEqual(['b', 'c', 'a'])
    expect(placeFavorites(['a', 'b', 'c'], ['c'], 0)).toEqual(['c', 'a', 'b'])
    expect(placeFavorites(['a', 'b', 'c'], ['b', 'b'])).toEqual(['a', 'c', 'b'])
  })

  it('removes one', () => {
    expect(removeFavorite(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('steps one up or down among those shown, skipping hidden ones', () => {
    const list = ['a', 'hidden', 'b', 'c']
    const shown = ['a', 'b', 'c']
    expect(placeFavorites(list, ['b'], stepFavorite(list, shown, 'b', -1)!)).toEqual([
      'b',
      'a',
      'hidden',
      'c',
    ])
    expect(placeFavorites(list, ['a'], stepFavorite(list, shown, 'a', 1)!)).toEqual([
      'hidden',
      'b',
      'a',
      'c',
    ])
    expect(stepFavorite(list, shown, 'a', -1)).toBeNull()
    expect(stepFavorite(list, shown, 'c', 1)).toBeNull()
  })
})
