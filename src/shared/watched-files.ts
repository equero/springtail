import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homeDirectory, watchedFilesPath } from './settings.js'

export type WatchedFiles = Record<string, string>

export async function readWatchedFiles(): Promise<WatchedFiles> {
  try {
    const stored: unknown = JSON.parse(await readFile(watchedFilesPath, 'utf8'))
    return typeof stored === 'object' && stored !== null ? (stored as WatchedFiles) : {}
  } catch {
    return {}
  }
}

export async function saveWatchedFiles(files: WatchedFiles): Promise<void> {
  await mkdir(homeDirectory, { recursive: true })
  await writeFile(watchedFilesPath, `${JSON.stringify(files, null, 2)}\n`)
}
