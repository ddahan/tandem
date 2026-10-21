# The website: the landing page built to static files (TANDEM_SITE=1, see
# packages/web/nuxt.config.ts), then served by Caddy. Built from the repository's root
# (site/compose.yaml).

FROM node:26-slim AS build
# pnpm version must match "packageManager" in package.json.
RUN npm install -g pnpm@12.10.1 && pnpm config set store-dir /pnpm-store --global
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/standalone/package.json packages/standalone/
RUN --mount=type=cache,id=tandem-pnpm-store,target=/pnpm-store \
  pnpm install --frozen-lockfile --ignore-scripts --filter @tandem/web...
COPY tsconfig.base.json ./
COPY packages/shared/src packages/shared/src
COPY packages/server/src packages/server/src
COPY packages/web packages/web
RUN pnpm --filter @tandem/web exec nuxt prepare && pnpm --filter @tandem/web build:site

FROM caddy:2-alpine
COPY site/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/web/.output-site/public /srv
