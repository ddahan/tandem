// `v-reveal`: fades and lifts an element in the first time it scrolls into view (landing page).
// The value is a delay in milliseconds, to stagger siblings. The CSS lives with the landing page
// (`.reveal`, `.reveal-visible`); with reduced motion, elements show at once.
import type { Directive } from 'vue'

const observers = new WeakMap<HTMLElement, IntersectionObserver>()

export const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(element, binding) {
    element.classList.add('reveal')
    if (binding.value) element.style.transitionDelay = `${binding.value}ms`
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        element.classList.add('reveal-visible')
        observer.disconnect()
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )
    observer.observe(element)
    observers.set(element, observer)
  },
  unmounted(element) {
    observers.get(element)?.disconnect()
    observers.delete(element)
  },
}
