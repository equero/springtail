import type { LogEntry, LogLevel } from '../shared/log-entry.js'

const SPRING_HEADER =
  /^\s*(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{3})?(?:Z|[+-]\d{2}:?\d{2})?)\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s+(\d+)?\s*(?:---\s*)?(.*)$/
const BRACKETED_GROUP = /^\s*\[([^\]]*)\]/
const LOGGER_AND_MESSAGE = /^([\w$.-]+)\s+[:-]\s?(.*)$/
const LOGGER_ALONE = /^\s*([\w$.-]+(?:\[[^\]]*\])?)\s*:\s*$/
const MAVEN_LINE = /^\[(INFO|WARNING|WARN|ERROR|DEBUG)\]\s?(.*)$/
const HIBERNATE_SQL = /^\s*Hibernate:\s?(.*)$/
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g')

type DraftKind = 'structured' | 'maven' | 'stdout'

interface Draft extends Omit<LogEntry, 'id' | 'message'> {
  kind: DraftKind
  lines: string[]
  awaitingLogger: boolean
}

type HeaderTail = Pick<LogEntry, 'thread' | 'context' | 'logger'> & { message: string | null }

let nextEntryId = 1

export class LogParser {
  #draft: Draft | null = null
  #completed: LogEntry[] = []

  get hasDraft(): boolean {
    return this.#draft !== null
  }

  feedLine(rawLine: string): void {
    const line = rawLine.replace(ANSI_ESCAPE, '').replace(/\r$/, '')

    const header = SPRING_HEADER.exec(line)
    if (header) {
      this.#startSpringEntry(header)
      return
    }

    const sql = HIBERNATE_SQL.exec(line)
    if (sql) {
      this.#startDraft({ kind: 'structured', level: 'SQL', logger: 'org.hibernate.SQL', lines: [sql[1] ?? ''] })
      return
    }

    const draft = this.#draft
    if (draft?.kind === 'structured') {
      continueStructured(draft, line)
      return
    }

    const maven = MAVEN_LINE.exec(line)
    if (maven) {
      this.#startDraft({ kind: 'maven', level: toLevel(maven[1]), logger: 'maven', lines: [maven[2] ?? ''] })
    } else if (line.trim() === '') {
      this.finishDraft()
    } else if (draft?.kind === 'stdout') {
      draft.lines.push(line)
    } else {
      this.#startDraft({ kind: 'stdout', level: 'OUT', logger: 'stdout', lines: [line] })
    }
  }

  finishDraft(): void {
    const draft = this.#draft
    if (!draft) return
    this.#draft = null

    const message = trimBlankLines(draft.lines).join('\n')
    if (!message) return

    const { time, level, pid, thread, context, logger } = draft
    this.#completed.push({ id: nextEntryId++, time, level, pid, thread, context, logger, message })
  }

  takeCompleted(): LogEntry[] {
    const completed = this.#completed
    this.#completed = []
    return completed
  }

  #startSpringEntry([, time = '', level, pid = '', tail = '']: RegExpExecArray): void {
    const { thread, context, logger, message } = splitHeaderTail(tail)
    this.#startDraft({
      kind: 'structured',
      time,
      level: toLevel(level),
      pid,
      thread,
      context,
      logger,
      lines: message === null ? [] : [message],
      awaitingLogger: logger === '',
    })
  }

  #startDraft(fields: Partial<Draft> & Pick<Draft, 'kind' | 'level' | 'lines'>): void {
    this.finishDraft()
    this.#draft = {
      time: localTimestamp(new Date()),
      pid: '',
      thread: '',
      context: '',
      logger: '',
      awaitingLogger: false,
      ...fields,
    }
  }
}

function continueStructured(draft: Draft, line: string): void {
  if (draft.awaitingLogger) {
    if (line.trim() === '') return
    draft.awaitingLogger = false
    const logger = LOGGER_ALONE.exec(line)?.[1]
    if (logger) {
      draft.logger = logger
      return
    }
  }
  draft.lines.push(line)
}

/**
 * Splits what follows the level and pid of a Spring Boot header:
 * `[app] [thread] [context] logger : message`.
 *
 * @param tail - Header text after the `---` separator.
 * @returns Thread, context, logger and the inline message, if the header carries one.
 */
function splitHeaderTail(tail: string): HeaderTail {
  const groups: string[] = []
  let rest = tail
  for (let group = BRACKETED_GROUP.exec(rest); group; group = BRACKETED_GROUP.exec(rest)) {
    groups.push((group[1] ?? '').trim())
    rest = rest.slice(group[0].length)
  }
  rest = rest.trim()

  const [first = '', second, ...extra] = groups
  const thread = second ?? first
  const contextParts = extra.filter(Boolean)

  const inline = LOGGER_AND_MESSAGE.exec(rest)
  if (inline) {
    return { thread, context: contextParts.join(' '), logger: inline[1] ?? '', message: inline[2] ?? '' }
  }
  if (rest) contextParts.push(rest)
  return { thread, context: contextParts.join(' '), logger: '', message: null }
}

/**
 * Maps the level names used by Logback, Log4j and Maven onto the viewer levels.
 *
 * @param name - Level as printed in the log.
 * @returns The matching viewer level.
 */
function toLevel(name: string | undefined): LogLevel {
  switch (name) {
    case 'WARNING':
      return 'WARN'
    case 'FATAL':
      return 'ERROR'
    case 'ERROR':
    case 'WARN':
    case 'INFO':
    case 'DEBUG':
    case 'TRACE':
      return name
    default:
      return 'OUT'
  }
}

/**
 * Drops blank lines at both ends, keeping the ones in between.
 *
 * @param lines - Message lines in order.
 * @returns The lines from the first to the last non-blank one.
 */
function trimBlankLines(lines: string[]): string[] {
  const isFilled = (line: string) => line.trim() !== ''
  const first = lines.findIndex(isFilled)
  return first === -1 ? [] : lines.slice(first, lines.findLastIndex(isFilled) + 1)
}

/**
 * Formats a date as a local ISO-like timestamp, for lines that carry no time of their own.
 *
 * @param date - Moment to format.
 * @returns `YYYY-MM-DDTHH:mm:ss.SSS` in local time.
 */
function localTimestamp(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return `${day}T${time}.${pad(date.getMilliseconds(), 3)}`
}
