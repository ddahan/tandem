# AGENTS.md — working on Myfluence

Instructions for coding agents (and humans) changing this repository. Read this file first,
then [docs/SPEC.md](docs/SPEC.md) (what the app must do) and
[docs/architecture.md](docs/architecture.md) (how it does it). Agents _using_ Myfluence (not
changing it) want [docs/agents.md](docs/agents.md).

## Layout

| Path                         | What it is                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `packages/shared`            | Types and rules shared by every package (titles, wiki links, authors, formats) |
| `packages/server`            | The server: vault, SQLite (Drizzle), search, history, watcher, API, MCP        |
| `packages/cli`               | The `myfluence` CLI                                                            |
| `packages/web`               | The Nuxt UI single-page app, its editor extensions, its Playwright tests       |
| `bin/myfluence`              | Runs the CLI in the running container, from the Mac                            |
| `mf`                         | The one command for development (`./mf` alone lists the commands)              |
| `compose.yaml`, `Dockerfile` | The app as the owner runs it                                                   |
| `compose.dev.yaml`           | Development toolchain (Node, pnpm, Chromium) and dev servers                   |
| `docs/`                      | SPEC (behavior), architecture, agents guide                                    |

## Commands

There is **no Node on the Mac**: Node and pnpm run in Docker, through `./mf`.

| Task                              | Command                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Dev servers with reload           | `./mf dev` → http://localhost:3010 (API on :3011, data in `.data/notes`)                   |
| Same, in the background (agents)  | `docker compose -f compose.dev.yaml --profile dev up -d`, then `… logs -f`, `… down`       |
| Demo notes in the dev data folder | `./mf pnpm --filter @myfluence/server seed http://server:3011`                             |
| All checks                        | `./mf check` (format, lint with 0 warnings, builds, type checks, unit tests with coverage) |
| End-to-end tests                  | `./mf e2e` (builds the web app, runs Playwright against the real server)                   |
| Unit tests of one package         | `./mf test server` (`shared`, `server`, `cli`, `web`)                                      |
| Format / lint                     | `./mf format` · `./mf lint`                                                                |
| Any pnpm command                  | `./mf pnpm <args>`, e.g. `./mf pnpm --filter @myfluence/web add <dep>`                     |
| The real app (the owner's)        | `./mf start` · `./mf stop` · `./mf logs` (http://localhost:3000)                           |
| Rebuild the toolchain image       | `./mf setup` (after changing `compose.dev.yaml`)                                           |

The owner's app (port 3000) and the dev servers (3010/3011) can run at the same time; they use
different data folders. **Never point the dev servers or tests at the owner's data folder.**

## Conventions

- **TypeScript everywhere**, strict, `noUncheckedIndexedAccess`. Server, CLI and shared code
  run with Node's type stripping: only erasable syntax (no enums, no parameter properties,
  no namespaces), `.ts` extensions in relative imports.
- **One version per dependency**, in the `catalog` of `pnpm-workspace.yaml`; packages use
  `"catalog:"`. Vue/Nuxt packages use `catalog:vue` for TypeScript (vue-tsc needs TS 6).
- **Formatting**: Oxfmt (no semicolons, single quotes, 100 columns). **Linting**: Oxlint with 0
  warnings. Oxfmt splits multi-statement template handlers (`@click="a; b"`) into lines Vue
  can't parse: put them in a function.
- **UI**: Nuxt UI components first, Tailwind utilities, Lucide icons written literally
  (`i-lucide-name`): icons are bundled at build time from what the source mentions.
- **Comments** explain why (rules, trade-offs, limitations); each module starts with what it
  is responsible for.
- **French formats** for dates and numbers (`formatDate`, `formatDateTime`, `formatNumber`,
  `formatSize` in shared); English for all text.
- **Database changes**: edit `packages/server/src/db/schema.ts`, then
  `./mf pnpm --filter @myfluence/server db:generate --name <change>`; raw SQL (FTS) goes in a
  custom migration (`./mf pnpm --filter @myfluence/server exec drizzle-kit generate --custom`).
  Never edit an applied migration. The owner's database must migrate forward.
- **Vault changes**: every public method takes the lock; internal ones assume it. Never call a
  public method from inside the lock (deadlock).
- **Markdown**: anything the editor writes must survive a round-trip (add a case to
  `packages/web/test/markdown.test.ts`), and new syntax must be documented in
  [docs/agents.md](docs/agents.md).
- **Security**: the app has no authentication and binds to 127.0.0.1; notes can be written by
  anyone, so rendered HTML is sanitized and `/files` never serves hidden files.

## Tests

| Level                | Where                  | What                                                                          |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| Unit (pure logic)    | `packages/*/test`      | shared rules, blame, search parsing, Markdown round-trips, authorship blocks  |
| Integration (server) | `packages/server/test` | vault on a temporary folder and in-memory database, API, MCP, watcher, backup |
| CLI                  | `packages/cli/test`    | commands against an in-memory app                                             |
| End-to-end           | `packages/web/e2e`     | the built web app and the real server in Chromium                             |

New behavior gets tests at the lowest level that covers it, and an end-to-end test when it is
a user-facing flow. `createTestVault()` (`packages/server/test/helpers.ts`) gives a vault with a
manual clock.

## Documentation (always in sync)

| Document               | Contains                                                |
| ---------------------- | ------------------------------------------------------- |
| `README.md`            | What Myfluence is, setup, daily use, agents in short    |
| `AGENTS.md` (this)     | How to work on the code, definition of done             |
| `docs/SPEC.md`         | Expected behavior (the product decisions)               |
| `docs/architecture.md` | How it is built                                         |
| `docs/agents.md`       | How agents use Myfluence (MCP, CLI, supported Markdown) |

Documentation is part of every change. Each fact lives in one place; link to it.

## Git

- Work on `main` unless told otherwise. Commit with [Conventional Commits](https://www.conventionalcommits.org)
  (`feat(editor): …`, `fix(server): …`, `docs: …`), one logical change per commit.
- Push only when the owner asks. Never commit `.env`, `.data/` or anything from the owner's
  notes.

## Definition of done

A change is done when:

1. `./mf check` passes.
2. `./mf e2e` passes.
3. New behavior has tests (see Tests), including Markdown round-trips for editor changes.
4. Server and shared code keep at least 80% line coverage (enforced by their `test` scripts,
   so by `./mf check`).
5. If dependencies, the Dockerfile, compose files or entry points changed: `./mf start` builds,
   and the app answers on http://localhost:3000.
6. A visible change was checked in a browser (dev servers), in light and dark mode.
7. The documentation describes the new behavior, and no document describes the old one
   (SPEC for behavior changes, architecture for design changes, agents guide for anything an
   agent sees).
8. The change is committed (Conventional Commits). No secrets, no personal notes.
