// The web app: a single-page app (no server rendering), built to static files that the
// Myfluence server serves. In development, `/api`, `/files` and `/mcp` go to the dev server.
const apiUrl = process.env.MYFLUENCE_API_URL ?? 'http://localhost:3011'

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'Myfluence',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'Notes, by you and your agents.' },
        { name: 'theme-color', content: '#18181b' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Myfluence' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
      link: [
        // Replaced at runtime by the logo in the accent color (app.vue).
        { key: 'favicon', rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
      script: [
        // The background tone, before the first paint (the rest: remembered-settings plugin).
        {
          innerHTML:
            "try{var s=JSON.parse(localStorage.getItem('myfluence-settings')||'null');if(s&&s.backgroundTone)document.documentElement.dataset.tone=s.backgroundTone}catch(e){}",
        },
        // The install prompt can come before the app starts: keep it (useInstallApp).
        {
          innerHTML:
            "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.myfluenceInstallPrompt=e})",
        },
      ],
    },
  },

  ui: {
    // Fonts are bundled (Fontsource), never fetched from Google.
    fonts: false,
    theme: { colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error'] },
  },

  colorMode: { preference: 'system', storageKey: 'myfluence-color-mode' },

  // Icons are bundled at build time: the app runs without internet and without an icon API.
  icon: {
    provider: 'none',
    fallbackToApi: false,
    clientBundle: {
      // .ts files too (the default only scans .vue…): icons named in utils and composables.
      scan: { globInclude: ['app/**/*.{vue,ts}'] },
      sizeLimitKb: 512,
    },
  },

  nitro: {
    devProxy: {
      '/api': { target: `${apiUrl}/api`, changeOrigin: true },
      '/files': { target: `${apiUrl}/files`, changeOrigin: true },
      '/mcp': { target: `${apiUrl}/mcp`, changeOrigin: true },
    },
  },

  devServer: { host: '0.0.0.0', port: 3010 },

  vite: {
    optimizeDeps: {
      include: ['lowlight', 'diff', 'marked', '@tiptap/extension-emoji', 'mermaid'],
    },
  },

  typescript: {
    tsConfig: { compilerOptions: { allowImportingTsExtensions: true } },
  },

  compatibilityDate: '2026-10-01',
})
