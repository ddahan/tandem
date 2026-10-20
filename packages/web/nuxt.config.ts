// The web app: a single-page app (no server rendering), built to static files that the
// Tandem server serves. In development, `/api`, `/files` and `/mcp` go to the dev server.
import { readFileSync } from 'node:fs'

const apiUrl = process.env.TANDEM_API_URL ?? 'http://localhost:3011'
// Tandem's version (the standalone package holds it, see README › Releasing), shown at the bottom of the sidebar.
// The web app is built with the server it ships with: its version is the app's.
const { version } = JSON.parse(
  readFileSync(new URL('../standalone/package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  ssr: false,
  devtools: { enabled: false },
  runtimeConfig: { public: { version } },
  css: ['~/assets/css/main.css'],

  app: {
    // Not Nuxt's `/_nuxt/`: versions up to 0.3.6 had those files cached for good, and Vite
    // writes CSS file names into scripts after naming them by their content, so a stylesheet
    // change kept some names; browsers then mixed old scripts (and their old stylesheet) with
    // the new ones. A new folder leaves those copies unused (the server now revalidates).
    buildAssetsDir: '/_app/',
    head: {
      title: 'Tandem',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'Notes, by you and your agents.' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Tandem' },
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
            "try{var s=JSON.parse(localStorage.getItem('tandem-settings')||'null');if(s&&s.backgroundTone)document.documentElement.dataset.tone=s.backgroundTone}catch(e){}",
        },
        // The title bar's color (theme-color), the last one seen (useThemeColor).
        {
          innerHTML:
            "var m=document.createElement('meta');m.name='theme-color';try{m.content=localStorage.getItem('tandem-theme-color')||''}catch(e){}if(!m.content)m.content=matchMedia('(prefers-color-scheme: dark)').matches?'#18181b':'#ffffff';document.head.appendChild(m)",
        },
        // The install prompt can come before the app starts: keep it (useInstallApp).
        {
          innerHTML:
            "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.tandemInstallPrompt=e})",
        },
      ],
    },
  },

  ui: {
    // Fonts are bundled (Fontsource), never fetched from Google.
    fonts: false,
    theme: { colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error'] },
  },

  colorMode: { preference: 'system', storageKey: 'tandem-color-mode' },

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
      include: [
        'lowlight',
        'diff',
        'marked',
        '@tiptap/extension-emoji',
        'mermaid',
        'hono/client',
        '@internationalized/date',
      ],
    },
  },

  typescript: {
    tsConfig: { compilerOptions: { allowImportingTsExtensions: true } },
  },

  compatibilityDate: '2026-10-01',
})
