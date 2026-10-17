#!/usr/bin/env node
// Entry point of the `myfluence` CLI (see cli.ts, or `myfluence --help`).
import { processIo, run } from './cli.ts'

process.exitCode = await run(process.argv.slice(2), processIo)
