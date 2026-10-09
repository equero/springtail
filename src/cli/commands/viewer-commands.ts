import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { logDirectory } from '../../shared/settings.js'
import { readWatchedFiles } from '../../shared/watched-files.js'
import { readProjectName } from '../project-name.js'
import { isViewerRunning, openViewer, stopViewer, viewerUrl } from '../viewer.js'

/**
 * Opens the viewer on a log.
 *
 * @param name - Log to show. Defaults to the project in the current folder; the viewer falls back to the latest log.
 * @returns Exit code.
 */
export async function openLogs(name: string | undefined): Promise<number> {
  return (await openViewer(name ?? (await readProjectName(process.cwd())))) ? 0 : 1
}

export async function closeViewer(): Promise<number> {
  console.log((await stopViewer()) ? 'Viewer stopped.' : 'The viewer was not running.')
  return 0
}

export async function listLogs(): Promise<number> {
  const captured = (await readdir(logDirectory).catch(() => [])).filter((file) => file.endsWith('.log'))
  const watched = Object.entries(await readWatchedFiles())

  for (const file of captured)
    console.log(`${file.slice(0, -'.log'.length).padEnd(28)} captured  ${join(logDirectory, file)}`)
  for (const [name, file] of watched) console.log(`${name.padEnd(28)} watched   ${file}`)
  if (captured.length === 0 && watched.length === 0) console.log('No logs yet.')

  console.log(`viewer: ${(await isViewerRunning()) ? viewerUrl : 'stopped'}`)
  return 0
}
