import type { LogEntry, LogLevel } from '../shared/log-entry.js'

export const LEVELS: readonly LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'SQL', 'OUT']

const MAX_ENTRIES = 20_000
const TRIM_SLACK = 2_000

export class EntryStore {
  #entries: LogEntry[] = []
  #counts = new Map<LogLevel, number>()

  get entries(): readonly LogEntry[] {
    return this.#entries
  }

  get last(): LogEntry | undefined {
    return this.#entries.at(-1)
  }

  add(entries: readonly LogEntry[]): void {
    for (const entry of entries) {
      this.#entries.push(entry)
      this.#counts.set(entry.level, this.countOf(entry.level) + 1)
    }
    if (this.#entries.length <= MAX_ENTRIES + TRIM_SLACK) return

    for (const dropped of this.#entries.splice(0, this.#entries.length - MAX_ENTRIES)) {
      this.#counts.set(dropped.level, this.countOf(dropped.level) - 1)
    }
  }

  clear(): void {
    this.#entries = []
    this.#counts.clear()
  }

  /**
   * Counts the stored entries of one level.
   *
   * @param level - Level to count.
   * @returns How many entries of that level are kept.
   */
  countOf(level: LogLevel): number {
    return this.#counts.get(level) ?? 0
  }
}
