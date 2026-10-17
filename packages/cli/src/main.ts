#!/usr/bin/env node
// Entry point of the `tandem` CLI (see cli.ts, or `tandem --help`).
import { processIo, run } from './cli.ts'

process.exitCode = await run(process.argv.slice(2), processIo)
