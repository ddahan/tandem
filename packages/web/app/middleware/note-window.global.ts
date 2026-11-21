// In a note's own window (useNoteWindow), every page shows without the sidebar and tab bar
// (layouts/note-window.vue), and keeps `?window` in its address: a link followed there, then a
// reload, still shows the page alone.
export default defineNuxtRouteMiddleware((to) => {
  if (!isNoteWindow()) return
  if (to.meta.layout !== false) to.meta.layout = 'note-window'
  if (!(NOTE_WINDOW_QUERY in to.query))
    return navigateTo(
      { path: to.path, query: { ...to.query, [NOTE_WINDOW_QUERY]: null }, hash: to.hash },
      { replace: true },
    )
})
