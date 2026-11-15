// Where the tab bar shows. Every page has its own bar (PageNavbar), made again with each page,
// but the tab bar is made once, by the layout, which moves it into the bar of the page open (a
// Teleport to this element): switching pages builds no tab again.
const host = shallowRef<HTMLElement | null>(null)

export function useTabBarHost() {
  return host
}
