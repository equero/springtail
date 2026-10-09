import type { LogEntry, LogLevel } from '../shared/log-entry.js'

export interface FilterSettings {
  levels: Set<LogLevel>
  search: string
  caseSensitive: boolean
  regex: boolean
  loggers: string
}

export interface CompiledFilter {
  matches: (entry: LogEntry) => boolean
  highlight: (text: string) => string
  error: string | null
}

interface SearchPatterns {
  test: RegExp
  highlight: RegExp
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escapes text so it can be placed inside HTML.
 *
 * @param text - Raw text.
 * @returns HTML-safe text.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)
}

/**
 * Splits the logger filter box into terms.
 *
 * @param text - Comma, semicolon or space separated terms.
 * @returns The non-empty terms.
 */
export function splitTerms(text: string): string[] {
  return text.split(/[\s,;]+/).filter(Boolean)
}

/**
 * Turns the filter settings into a matcher and a highlighter.
 *
 * @param settings - Current filter settings.
 * @param hiddenUpToId - Entries with this id or lower were cleared by the user.
 * @returns The compiled filter, with an error message when the search regex is invalid.
 */
export function compileFilter(settings: FilterSettings, hiddenUpToId: number): CompiledFilter {
  const { patterns, error } = compileSearch(settings)
  const loggerAllowed = compileLoggerRule(settings.loggers)

  return {
    error,
    matches: (entry) =>
      entry.id > hiddenUpToId &&
      settings.levels.has(entry.level) &&
      loggerAllowed(entry.logger) &&
      (!patterns || patterns.test.test(searchableText(entry))),
    highlight: (text) => (patterns ? highlightMatches(text, patterns.highlight) : escapeHtml(text)),
  }
}

/**
 * Builds the search regexes, one to test entries and a global one to highlight matches.
 *
 * @param settings - Current filter settings.
 * @returns The patterns, or an error when the user's regex does not compile.
 */
function compileSearch(settings: FilterSettings): { patterns: SearchPatterns | null; error: string | null } {
  if (!settings.search) return { patterns: null, error: null }

  const source = settings.regex ? settings.search : settings.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flags = settings.caseSensitive ? '' : 'i'
  try {
    return { patterns: { test: new RegExp(source, flags), highlight: new RegExp(source, `${flags}g`) }, error: null }
  } catch (error) {
    return { patterns: null, error: `Invalid regex: ${(error as Error).message}` }
  }
}

/**
 * Builds the logger rule: plain terms must appear in the logger name, terms starting with `-` must not.
 *
 * @param text - Content of the logger filter box.
 * @returns A predicate over logger names.
 */
function compileLoggerRule(text: string): (logger: string) => boolean {
  const terms = splitTerms(text.toLowerCase())
  const included = terms.filter((term) => !term.startsWith('-'))
  const excluded = terms.filter((term) => term.startsWith('-') && term.length > 1).map((term) => term.slice(1))

  return (logger) => {
    const name = logger.toLowerCase()
    const isIncluded = included.length === 0 || included.some((term) => name.includes(term))
    return isIncluded && !excluded.some((term) => name.includes(term))
  }
}

/**
 * Wraps every match in `<mark>` and escapes the rest.
 *
 * @param text - Raw text.
 * @param pattern - Global search regex.
 * @returns HTML with the matches marked.
 */
function highlightMatches(text: string, pattern: RegExp): string {
  let html = ''
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    if (match[0] === '') continue
    html += `${escapeHtml(text.slice(cursor, match.index))}<mark>${escapeHtml(match[0])}</mark>`
    cursor = match.index + match[0].length
  }
  return html + escapeHtml(text.slice(cursor))
}

/**
 * Joins the fields the search box looks into.
 *
 * @param entry - Log entry.
 * @returns Message, logger, thread and context on separate lines.
 */
function searchableText(entry: LogEntry): string {
  return `${entry.message}\n${entry.logger}\n${entry.thread}\n${entry.context}`
}
