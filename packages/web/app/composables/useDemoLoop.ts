// Runs a scripted, looping animation (the landing page's demos): `run` gets a `wait` that
// resolves after a delay, or rejects once the component is gone, which ends the loop. With
// reduced motion, `run` isn't called: the demo shows its final state instead.
import { usePreferredReducedMotion } from '@vueuse/core'

class Stopped extends Error {}

export function useDemoLoop(run: (wait: (ms: number) => Promise<void>) => Promise<void>) {
  const motion = usePreferredReducedMotion()
  const reduced = computed(() => motion.value === 'reduce')
  let stopped = false
  const timers = new Set<ReturnType<typeof setTimeout>>()

  function wait(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (stopped) return reject(new Stopped())
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (stopped) reject(new Stopped())
        else resolve()
      }, ms)
      timers.add(timer)
    })
  }

  onMounted(async () => {
    if (reduced.value) return
    try {
      for (;;) await run(wait)
    } catch (error) {
      if (!(error instanceof Stopped)) throw error
    }
  })
  onBeforeUnmount(() => {
    stopped = true
    for (const timer of timers) clearTimeout(timer)
  })

  return { reduced }
}
