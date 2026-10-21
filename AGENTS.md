# AGENTS.md — working on Tandem

Instructions for coding agents (and humans) changing this repository. Read this file first,
then [docs/SPEC.md](docs/SPEC.md) (what the app must do) and
[docs/architecture.md](docs/architecture.md) (how it does it). Agents _using_ Tandem (not
changing it) want [docs/agents.md](docs/agents.md).

**Asked to install Tandem** (not to change it)? Follow
[README › Installing with an AI agent](README.md#installing-with-an-ai-agent): no build from
source, no admin rights: one command (`app/get.sh`) downloads the latest release and runs its
`app/install.sh`, which also works from a downloaded copy, with no network needed.

## Layout

| Path                         | What it is                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `packages/shared`            | Types and rules shared by every package (titles, wiki links, authors, formats) |
| `packages/server`            | The server: vault, SQLite (Drizzle), search, history, watcher, API, MCP        |
| `packages/cli`               | The `tandem` CLI                                                               |
| `packages/web`               | The Nuxt UI single-page app, its editor extensions, its Playwright tests       |
| `packages/standalone`        | The standalone app (server + CLI + web app, run by Node) and its build         |
| `app/`                       | The app people install (`tandem/`, built), `install.sh` and `get.sh`           |
| `bin/tandem`                 | Runs the CLI in the running container, from the Mac                            |
| `td`                         | The one command for development (`./td` alone lists the commands)              |
| `compose.yaml`, `Dockerfile` | The app as the owner runs it                                                   |
| `compose.dev.yaml`           | Development toolchain (Node, pnpm, Chromium) and dev servers                   |
| `docs/`                      | SPEC (behavior), architecture, agents guide                                    |

## Commands

There is **no Node on the Mac**: Node and pnpm run in Docker, through `./td`.

| Task                              | Command                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Dev servers with reload           | `./td dev` → http://localhost:3010 (API on :3011, data in `.data/notes`)                   |
| Same, in the background (agents)  | `docker compose -f compose.dev.yaml --profile dev up -d`, then `… logs -f`, `… down`       |
| Demo notes in the dev data folder | `./td pnpm --filter @tandem/server seed http://server:3011`                                |
| All checks                        | `./td check` (format, lint with 0 warnings, builds, type checks, unit tests with coverage) |
| End-to-end tests                  | `./td e2e` (builds the web app, runs Playwright against the real server)                   |
| Unit tests of one package         | `./td test server` (`shared`, `server`, `cli`, `web`, `standalone`)                        |
| Server benchmark                  | `./td pnpm --filter @tandem/server bench [pages]` (large generated vault, API timings)     |
| Format / lint                     | `./td format` · `./td lint`                                                                |
| Any pnpm command                  | `./td pnpm <args>`, e.g. `./td pnpm --filter @tandem/web add <dep>`                        |
| The real app (the owner's)        | `./td start` · `./td stop` · `./td logs` (http://localhost:3864)                           |
| Rebuild the toolchain image       | `./td setup` (after changing `compose.dev.yaml`)                                           |
| The app people install            | `./td release`, into `app/tandem/` (checked on Node 22.16 and `app/node.env`'s)            |
| The Node the installer downloads  | `./td node-pin <version>` (`app/node.env`: version and checksums)                          |

The owner's app (port 3864) and the dev servers (3010/3011) can run at the same time; they use
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
  Everything clickable shows a pointer: a base rule in `main.css` covers buttons, links and
  ARIA roles; give a custom clickable element one of those (or `cursor-pointer`).
- **Comments** explain why (rules, trade-offs, limitations); each module starts with what it
  is responsible for.
- **French formats** for dates and numbers (`formatDate`, `formatDateTime`, `formatNumber`,
  `formatSize` in shared); English for all text.
- **Database changes**: edit `packages/server/src/db/schema.ts`, then
  `./td pnpm --filter @tandem/server db:generate --name <change>`; raw SQL (FTS) goes in a
  custom migration (`./td pnpm --filter @tandem/server exec drizzle-kit generate --custom`).
  Never edit an applied migration. The owner's database must migrate forward.
- **Vault changes**: every public method takes the lock; internal ones assume it. Never call a
  public method from inside the lock (deadlock).
- **Markdown**: anything the editor writes must survive a round-trip (add a case to
  `packages/web/test/markdown.test.ts`), and new syntax must be documented in
  [docs/agents.md](docs/agents.md) and shown in Docs › Blocks
  (`packages/web/app/utils/docs-blocks.ts`).
- **Shortcuts**: a new or changed keyboard shortcut or typing rule goes in
  `packages/web/app/utils/shortcuts.ts` too: Docs › Shortcuts shows that list.
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

| Document               | Contains                                             |
| ---------------------- | ---------------------------------------------------- |
| `README.md`            | What Tandem is, setup, daily use, agents in short    |
| `AGENTS.md` (this)     | How to work on the code, definition of done          |
| `docs/SPEC.md`         | Expected behavior (the product decisions)            |
| `docs/architecture.md` | How it is built                                      |
| `docs/agents.md`       | How agents use Tandem (MCP, CLI, supported Markdown) |

Documentation is part of every change. Each fact lives in one place; link to it.

## Git

- Work on `main` unless told otherwise. Commit with [Conventional Commits](https://www.conventionalcommits.org)
  (`feat(editor): …`, `fix(server): …`, `docs: …`), one logical change per commit.
- Push only when the owner asks. Never commit `.env`, `.data/` or anything from the owner's
  notes.

## Definition of done

A change is done when:

1. `./td check` passes.
2. `./td e2e` passes.
3. New behavior has tests (see Tests), including Markdown round-trips for editor changes.
4. Server and shared code keep at least 80% line coverage (enforced by their `test` scripts,
   so by `./td check`).
5. If dependencies, the Dockerfile, compose files or entry points changed: `./td start` builds,
   and the app answers on http://localhost:3864. If the server's start-up, the standalone
   package, `app/install.sh` or `app/get.sh` changed: `./td release` passes (it checks the app on Node 22.16
   and `app/node.env`'s). Commit `app/tandem/` only for a release; otherwise `git restore app/tandem`.
6. A visible change was checked in a browser (dev servers), in light and dark mode.
7. The documentation describes the new behavior, and no document describes the old one
   (SPEC for behavior changes, architecture for design changes, agents guide for anything an
   agent sees).
8. The change is committed (Conventional Commits). No secrets, no personal notes.
