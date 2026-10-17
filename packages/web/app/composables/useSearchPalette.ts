// The search palette (⌘⇧F) is the app's only search. Anything can open it, optionally with a
// query (e.g. a tag filter).
export function useSearchPalette() {
  const open = useState('search:open', () => false)
  const term = useState('search:term', () => '')

  function openSearch(query = '') {
    term.value = query
    open.value = true
  }

  return { open, term, openSearch }
}
