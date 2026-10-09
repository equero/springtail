import type { LogEntry } from '../shared/log-entry.js'
import { escapeHtml } from './filters.js'

const CLOCK_TIME = /T?(\d{2}:\d{2}:\d{2}(?:[.,]\d{3})?)/

/**
 * Builds the inner HTML of a log row.
 *
 * @param entry - Entry to show.
 * @param expanded - Show the whole message and its metadata instead of the first line.
 * @param highlight - Escapes text and marks search matches.
 * @returns Row HTML.
 */
export function rowHtml(entry: LogEntry, expanded: boolean, highlight: (text: string) => string): string {
  const [firstLine = '', ...otherLines] = entry.message.split('\n')
  const message = expanded
    ? `${metadataHtml(entry)}${highlight(entry.message)}`
    : `${highlight(firstLine)}${otherLines.length > 0 ? `<span class="more">+${otherLines.length}</span>` : ''}`

  return (
    `<span class="time">${escapeHtml(clockTime(entry.time))}</span>` +
    `<span class="level">${entry.level}</span>` +
    `<span class="logger" title="${escapeHtml(entry.logger)}">${escapeHtml(abbreviateLogger(entry.logger))}</span>` +
    `<span class="message">${message}</span>`
  )
}

/**
 * Builds the metadata line shown above an expanded message.
 *
 * @param entry - Entry to describe.
 * @returns HTML for timestamp, thread, pid and context, or nothing when there is no metadata.
 */
function metadataHtml(entry: LogEntry): string {
  const details = [entry.thread && `[${entry.thread}]`, entry.pid && `pid ${entry.pid}`, entry.context]
    .filter(Boolean)
    .join('  ')
  return details ? `<span class="meta">${escapeHtml(`${entry.time}  ${details}`)}</span>` : ''
}

/**
 * Keeps only the clock part of a timestamp.
 *
 * @param timestamp - ISO-like timestamp.
 * @returns `HH:mm:ss.SSS`, or an empty string.
 */
function clockTime(timestamp: string): string {
  return CLOCK_TIME.exec(timestamp)?.[1] ?? ''
}

/**
 * Shortens a logger the way Logback does: `org.springframework.web.Servlet` becomes `o.s.w.Servlet`.
 *
 * @param name - Fully qualified logger name.
 * @returns The abbreviated name.
 */
function abbreviateLogger(name: string): string {
  const parts = name.split('.')
  if (parts.length <= 2) return name
  const className = parts.pop() ?? ''
  return [...parts.map((part) => part.charAt(0)), className].join('.')
}
