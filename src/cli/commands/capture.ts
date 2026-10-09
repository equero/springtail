import { closeSync, openSync, writeSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { logDirectory } from '../../shared/settings.js'
import { CliError } from '../cli-error.js'
import { readProjectName } from '../project-name.js'
import { openViewer } from '../viewer.js'

const SOURCE_NAME = /^[\w.-]+$/

/**
 * Copies piped output to the console and to a log the viewer reads, until the producer stops.
 *
 * @param name - Name to show in the viewer. Defaults to the project in the current folder.
 * @param open - Also open the viewer.
 * @returns Exit code.
 */
export async function captureOutput(name: string | undefined, open: boolean): Promise<number> {
  if (process.stdin.isTTY) {
    throw new CliError('Nothing is piped in. Use it like this: mvn spring-boot:run 2>&1 | springtail capture')
  }
  const sourceName = name ?? (await readProjectName(process.cwd()))
  if (!SOURCE_NAME.test(sourceName)) {
    throw new CliError(`Invalid name: ${sourceName}. Use letters, digits, dots, dashes or underscores.`)
  }

  await mkdir(logDirectory, { recursive: true })
  const logFile = join(logDirectory, `${sourceName}.log`)
  const descriptor = openSync(logFile, 'w')
  console.error(`springtail: capturing into ${logFile}`)
  if (open) await openViewer(sourceName)

  try {
    for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
      process.stdout.write(chunk)
      writeSync(descriptor, chunk)
    }
  } finally {
    closeSync(descriptor)
  }
  return 0
}
