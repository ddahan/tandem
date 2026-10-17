# Production image: the server (TypeScript run directly by Node, no build step), the built web
# app, and the `myfluence` CLI. Built by `docker compose build` (compose.yaml).

FROM node:26-slim AS base
# pnpm version must match "packageManager" in package.json.
RUN npm install -g pnpm@12.10.1 && pnpm config set store-dir /pnpm-store --global
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/web/package.json packages/web/

# --- The web app, built to static files ---------------------------------------------------
FROM base AS web
RUN --mount=type=cache,id=myfluence-pnpm-store,target=/pnpm-store \
  pnpm install --frozen-lockfile --ignore-scripts --filter @myfluence/web...
COPY tsconfig.base.json ./
COPY packages/shared/src packages/shared/src
COPY packages/server/src packages/server/src
COPY packages/web packages/web
RUN pnpm --filter @myfluence/web exec nuxt prepare && pnpm --filter @myfluence/web build

# --- Runtime -----------------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
  TZ=Europe/Paris \
  PORT=3000 \
  MYFLUENCE_DATA_DIR=/data \
  MYFLUENCE_DB_PATH=/var/lib/myfluence/myfluence.db \
  MYFLUENCE_WEB_DIR=/app/packages/web/dist
RUN --mount=type=cache,id=myfluence-pnpm-store,target=/pnpm-store \
  pnpm install --frozen-lockfile --prod --filter @myfluence/server... --filter @myfluence/cli...
COPY packages/shared/src packages/shared/src
COPY packages/server/src packages/server/src
COPY packages/server/drizzle packages/server/drizzle
COPY packages/cli/src packages/cli/src
COPY --from=web /app/packages/web/.output/public packages/web/dist
RUN chmod +x packages/cli/src/main.ts \
  && ln -s /app/packages/cli/src/main.ts /usr/local/bin/myfluence \
  && mkdir -p /data /var/lib/myfluence \
  && chown node:node /data /var/lib/myfluence
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "packages/server/src/main.ts"]
