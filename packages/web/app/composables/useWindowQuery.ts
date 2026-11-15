// Whether the window matches a media query, known from the first render. VueUse's
// useMediaQuery answers false until its component is mounted (right for server rendering, which
// this app doesn't have): a page read with it is drawn for a narrow window, then drawn again.
import { useEventListener } from '@vueuse/core'

export function useWindowQuery(query: string) {
  const list = window.matchMedia(query)
  const matches = ref(list.matches)
  useEventListener(list, 'change', (event: MediaQueryListEvent) => (matches.value = event.matches))
  return matches
}
