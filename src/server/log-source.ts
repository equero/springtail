import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'
import type { LogEntry, SourceStatus } from '../shared/log-entry.js'
import { LogParser } from './log-parser.js'

const MAX_ENTRIES = 20_000
const TRIM_SLACK = 2_000
const IDLE_FLUSH_MS = 300
const INITIAL_TAIL_BYTES = 2 * 1024 * 1024

export type SourceEvent = { type: 'entries'; entries: LogEntry[] } | { type: 'reset' } | { type: 'closed' }

type Listener = (event: SourceEvent) => void

export class LogSource {
  readonly name: string
  readonly file: string
  #entries: LogEntry[] = []
  #parser = new LogParser()
  #decoder = new StringDecoder('utf8')
  #partialLine = ''
  #offset = 0
  #started = false
  #skipCutLine = false
  #exists = false
  #size = 0
  #modifiedAt = 0
  #polling = false
  #idleTimer: NodeJS.Timeout | undefined
  #listeners = new Set<Listener>()

  constructor(name: string, file: string) {
    this.name = name
    this.file = file
  }

  get entries(): readonly LogEntry[] {
    return this.#entries
  }

  status(): SourceStatus {
    return {
      name: this.name,
      file: this.file,
      exists: this.#exists,
      size: this.#size,
      modifiedAt: this.#modifiedAt,
      total: this.#entries.length,
    }
  }

  /**
   * Registers a listener for new entries and restarts of the log.
   *
   * @param listener - Called with every event of this source.
   * @returns A function that removes the listener.
   */
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async poll(): Promise<void> {
    if (this.#polling) return
    this.#polling = true
    try {
      await this.#readNewBytes()
    } catch {
      this.#exists = false
    } finally {
      this.#polling = false
    }
  }

  async #readNewBytes(): Promise<void> {
    const stats = await stat(this.file)
    this.#exists = true
    this.#size = stats.size
    this.#modifiedAt = stats.mtimeMs

    if (!this.#started) this.#startNearEnd(stats.size)
    if (stats.size < this.#offset) this.#restart()
    if (stats.size === this.#offset) return

    const stream = createReadStream(this.file, { start: this.#offset, end: stats.size - 1 })
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      this.#offset += chunk.length
      this.#feed(this.#decoder.write(chunk))
      this.#publish()
    }
    this.#scheduleIdleFlush()
  }

  #feed(text: string): void {
    const lines = (this.#partialLine + text).split('\n')
    this.#partialLine = lines.pop() ?? ''
    if (this.#skipCutLine && lines.length > 0) {
      lines.shift()
      this.#skipCutLine = false
    }
    for (const line of lines) this.#parser.feedLine(line)
  }

  #publish(): void {
    const entries = this.#parser.takeCompleted()
    if (entries.length === 0) return

    for (const entry of entries) this.#entries.push(entry)
    if (this.#entries.length > MAX_ENTRIES + TRIM_SLACK) {
      this.#entries.splice(0, this.#entries.length - MAX_ENTRIES)
    }
    this.#emit({ type: 'entries', entries })
  }

  #scheduleIdleFlush(): void {
    clearTimeout(this.#idleTimer)
    if (!this.#parser.hasDraft) return
    this.#idleTimer = setTimeout(() => {
      this.#parser.finishDraft()
      this.#publish()
    }, IDLE_FLUSH_MS)
  }

  close(): void {
    clearTimeout(this.#idleTimer)
    this.#emit({ type: 'closed' })
    this.#listeners.clear()
  }

  #startNearEnd(size: number): void {
    this.#started = true
    if (size <= INITIAL_TAIL_BYTES) return
    this.#offset = size - INITIAL_TAIL_BYTES
    this.#skipCutLine = true
  }

  #restart(): void {
    clearTimeout(this.#idleTimer)
    this.#entries = []
    this.#parser = new LogParser()
    this.#decoder = new StringDecoder('utf8')
    this.#partialLine = ''
    this.#offset = 0
    this.#skipCutLine = false
    this.#emit({ type: 'reset' })
  }

  #emit(event: SourceEvent): void {
    for (const listener of this.#listeners) listener(event)
  }
}
