#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { CliError } from './cli-error.js'
import { captureOutput } from './commands/capture.js'
import { closeViewer, listLogs, openLogs } from './commands/viewer-commands.js'
import { unwatchLog, watchLog } from './commands/watch.js'

const USAGE = `Usage: springtail <command> [options]

Follow the log of a backend you started yourself, live in the browser.

Commands
  watch [folder|file]   Follow the log file a running app writes (default: newest .log in the
                        current folder, logs/, log/ or target/)
      --name <name>     Name shown in the viewer (default: the project's artifactId)
  capture [name]        Save piped output for the viewer:  mvn spring-boot:run 2>&1 | springtail capture
      --open            Also open the viewer
  open [name]           Open the viewer
  list                  Show the logs the viewer knows about
  unwatch <name>        Stop following a watched log
  stop                  Stop the viewer

Options
  -h, --help            Show this help
  -v, --version         Show the version`

const OPTIONS = {
  name: { type: 'string' },
  open: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
} as const

async function main(): Promise<number> {
  const { positionals, values } = parseCommandLine()
  const [command, argument] = positionals

  if (values.version) {
    console.log(await readVersion())
    return 0
  }
  if (values.help || command === undefined) {
    console.log(USAGE)
    return 0
  }

  switch (command) {
    case 'watch':
      return watchLog(argument, values.name)
    case 'capture':
      return captureOutput(argument, values.open)
    case 'open':
      return openLogs(argument)
    case 'list':
      return listLogs()
    case 'unwatch':
      return unwatchLog(argument)
    case 'stop':
      return closeViewer()
    default:
      throw new CliError(`Unknown command: ${command}\n\n${USAGE}`)
  }
}

function parseCommandLine() {
  try {
    return parseArgs({ allowPositionals: true, options: OPTIONS })
  } catch (error) {
    throw new CliError(`${(error as Error).message}\n\n${USAGE}`)
  }
}

async function readVersion(): Promise<string> {
  const packageJson = await readFile(new URL('../../package.json', import.meta.url), 'utf8')
  return (JSON.parse(packageJson) as { version: string }).version
}

try {
  process.exitCode = await main()
} catch (error) {
  if (!(error instanceof CliError)) throw error
  console.error(error.message)
  process.exitCode = 1
}
