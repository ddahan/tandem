# The website

[tandem.w3lt.org](https://tandem.w3lt.org): the landing page of `packages/web`
(`app/pages/landing.vue`), built alone with `TANDEM_SITE=1` and served by Caddy. The app itself
has no landing page.

- Preview: `./td dev`, then <http://localhost:3012> (it reloads as you edit).
- Build: `./td pnpm --filter @tandem/web build:site` (into `packages/web/.output-site/public`).
- Deploy, with [DokWalt](https://dokwalt.w3lt.org), from this folder: `dokwalt deploy`. The app
  is `tandem-site`, its domain `tandem.w3lt.org` (a DNS `A` record to the server).
