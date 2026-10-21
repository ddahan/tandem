// Daily notes (shared/calendar.ts): opening a day's note, which the server creates when the day
// has none (one call, so that two windows or an agent never make two). The note page drops it
// again when it is left empty (pages/notes/[id].vue).
import { isoDate } from '@tandem/shared'

export function useDaily() {
  const api = useApi()
  const tree = useTree()
  const showError = useApiErrorToast()

  async function open(date = isoDate(), options: { replace?: boolean } = {}) {
    try {
      const node = await unwrap(api.calendar[':date'].$post({ param: { date } }))
      // Its Calendar folder may be new too.
      if (!tree.byId.value.has(node.id)) await tree.refresh()
      await navigateTo(`/notes/${node.id}`, { replace: options.replace })
    } catch (error) {
      showError(error, 'Could not open this day')
    }
  }

  return { open }
}
