import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { readWatchedFiles, saveWatchedFiles } from '../../shared/watched-files.js'
import { CliError } from '../cli-error.js'
import { readProjectName } from '../project-name.js'
import { openViewer } from '../viewer.js'

const LOG_FOLDERS = ['.', 'logs', 'log', 'target']
const LOG_EXTENSION = '.log'

/**
 * Registers the log file of a running application and opens it in the viewer.
 *
 * @param target - Log file, or project folder to search for one. Defaults to the current folder.
 * @param name - Name to show in the viewer. Defaults to the project name.
 * @returns Exit code.
 */
export async function watchLog(target: string | undefined, name: string | undefined): Promise<number> {
  const path = resolve(target ?? '.')
  const stats = await stat(path).catch(() => null)
  if (!stats) throw new CliError(`${path} does not exist.`)

  const file = stats.isDirectory() ? await findNewestLog(path) : path
  const sourceName = name ?? (stats.isDirectory() ? await readProjectName(path) : basename(path, extname(path)))

  const watched = await readWatchedFiles()
  watched[sourceName] = file
  await saveWatchedFiles(watched)
  console.log(`Watching ${file} as ${sourceName}`)

  return (await openViewer(sourceName)) ? 0 : 1
}

export async function unwatchLog(name: string | undefined): Promise<number> {
  if (!name) throw new CliError('Which one? Usage: springtail unwatch <name>  (see springtail list)')
  const watched = await readWatchedFiles()
  if (!(name in watched)) throw new CliError(`${name} is not being watched.`)
  delete watched[name]
  await saveWatchedFiles(watched)
  console.log(`Stopped watching ${name}.`)
  return 0
}

/**
 * Finds the most recently written `.log` file in a project folder or its usual log folders.
 *
 * @param directory - Project folder.
 * @returns Absolute path of the log file.
 * @throws {@link CliError} when there is no log file.
 */
async function findNewestLog(directory: string): Promise<string> {
  let newest: { file: string; modifiedAt: number } | null = null
  for (const folder of LOG_FOLDERS.map((name) => join(directory, name))) {
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(LOG_EXTENSION)) continue
      const file = join(folder, entry.name)
      const modifiedAt = (await stat(file)).mtimeMs
      if (!newest || modifiedAt > newest.modifiedAt) newest = { file, modifiedAt }
    }
  }
  if (!newest) {
    throw new CliError(
      `No .log file in ${directory} or its logs/, log/ or target/ folders.\n` +
        'Make the app write one (for Spring Boot: logging.file.name=logs/app.log) or pass the file path.',
    )
  }
  return newest.file
}
