import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SourceStatus } from '../shared/log-entry.js'
import { readWatchedFiles } from '../shared/watched-files.js'
import { LogSource } from './log-source.js'

const LOG_EXTENSION = '.log'

export class SourceRegistry {
  readonly directory: string
  #sources = new Map<string, LogSource>()

  constructor(directory: string) {
    this.directory = directory
  }

  /**
   * Looks up the source of a project.
   *
   * @param name - Source name: a captured log file name without extension, or a watched name.
   * @returns The source, or `undefined` when there is no such log.
   */
  get(name: string): LogSource | undefined {
    return this.#sources.get(name)
  }

  async scan(): Promise<void> {
    const wanted = new Map<string, string>()
    for (const file of await readdir(this.directory).catch(() => [])) {
      if (file.toLowerCase().endsWith(LOG_EXTENSION)) {
        wanted.set(file.slice(0, -LOG_EXTENSION.length), join(this.directory, file))
      }
    }
    for (const [name, file] of Object.entries(await readWatchedFiles())) wanted.set(name, file)

    for (const name of this.#sources.keys()) {
      if (!wanted.has(name)) this.#replace(name, undefined)
    }
    for (const [name, file] of wanted) {
      if (this.#sources.get(name)?.file !== file) this.#replace(name, file)
    }
  }

  async pollAll(): Promise<void> {
    await Promise.all([...this.#sources.values()].map((source) => source.poll()))
  }

  statuses(): SourceStatus[] {
    return [...this.#sources.values()].map((source) => source.status()).sort((a, b) => b.modifiedAt - a.modifiedAt)
  }

  #replace(name: string, file: string | undefined): void {
    this.#sources.get(name)?.close()
    if (file === undefined) this.#sources.delete(name)
    else this.#sources.set(name, new LogSource(name, file))
  }
}
