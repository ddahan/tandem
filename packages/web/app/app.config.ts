// Default theme; the owner's choices (Settings page) replace the colors at runtime.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      neutral: 'zinc',
    },
    tree: {
      slots: {
        link: 'py-1',
      },
    },
  },
})
