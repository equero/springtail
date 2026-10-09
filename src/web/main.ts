import type { LogEntry, LogLevel, SourceStatus, SourcesResponse } from '../shared/log-entry.js'
import { EntryStore, LEVELS } from './entry-store.js'
import { compileFilter, splitTerms } from './filters.js'
import { loadFilterSettings, saveFilterSettings } from './preferences.js'
import { rowHtml } from './render.js'

const MAX_ROWS = 3_000
const FILTER_DELAY_MS = 120
const SOURCES_REFRESH_MS = 3_000
const LIVE_WINDOW_MS = 15_000
const FOLLOW_THRESHOLD_PX = 30

/**
 * Finds a required element of the page.
 *
 * @param id - Element id.
 * @returns The element.
 */
function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id} in the page`)
  return element as T
}

const ui = {
  connection: byId('connection'),
  source: byId<HTMLSelectElement>('source'),
  file: byId('file'),
  search: byId<HTMLInputElement>('search'),
  caseToggle: byId<HTMLButtonElement>('case-toggle'),
  regexToggle: byId<HTMLButtonElement>('regex-toggle'),
  loggers: byId<HTMLInputElement>('loggers'),
  levels: byId('levels'),
  pause: byId<HTMLButtonElement>('pause'),
  follow: byId<HTMLButtonElement>('follow'),
  expand: byId<HTMLButtonElement>('expand'),
  clear: byId<HTMLButtonElement>('clear'),
  log: byId('log'),
  count: byId('count'),
  error: byId('error'),
}

const store = new EntryStore()
const rowEntries = new WeakMap<Element, LogEntry>()
const settings = loadFilterSettings()
let hiddenUpToId = 0
let filter = compileFilter(settings, hiddenUpToId)
let heldCount = 0
let paused = false
let following = true
let expandAll = false
let renderedRows = 0
let currentSource: string | null = null
let events: EventSource | null = null
let filterTimer: number | undefined

function createRow(entry: LogEntry): HTMLDivElement {
  const row = document.createElement('div')
  row.className = `row level-${entry.level}${expandAll ? ' open' : ''}`
  row.innerHTML = rowHtml(entry, expandAll, filter.highlight)
  rowEntries.set(row, entry)
  return row
}

function showPlaceholder(html: string): void {
  ui.log.innerHTML = `<div class="placeholder">${html}</div>`
  renderedRows = 0
}

function showDivider(text: string): void {
  const divider = document.createElement('div')
  divider.className = 'divider'
  divider.textContent = text
  ui.log.replaceChildren(divider)
  renderedRows = 0
}

function renderAll(): void {
  const visible: LogEntry[] = []
  const entries = store.entries
  for (let index = entries.length - 1; index >= 0 && visible.length < MAX_ROWS; index--) {
    const entry = entries[index]
    if (entry && filter.matches(entry)) visible.push(entry)
  }

  if (visible.length > 0) {
    ui.log.replaceChildren(...visible.reverse().map(createRow))
    renderedRows = visible.length
  } else if (entries.length > 0) {
    showPlaceholder('Nothing matches the current filters.')
  } else {
    showPlaceholder(
      'Waiting for output. Point the viewer at a log with <code>springtail watch</code> or <code>springtail capture</code>.',
    )
  }
  heldCount = 0
  updateCounters()
  if (following) scrollToEnd()
}

function appendRows(entries: readonly LogEntry[]): void {
  const rows = entries.filter(filter.matches).slice(-MAX_ROWS).map(createRow)
  if (rows.length > 0) {
    ui.log.querySelector('.placeholder')?.remove()
    ui.log.append(...rows)
    renderedRows += rows.length
    for (; renderedRows > MAX_ROWS; renderedRows--) ui.log.querySelector('.row')?.remove()
    if (following) scrollToEnd()
  }
  updateCounters()
}

function receiveEntries(entries: LogEntry[]): void {
  store.add(entries)
  if (paused) {
    heldCount += entries.length
    updateCounters()
  } else {
    appendRows(entries)
  }
}

function scrollToEnd(): void {
  ui.log.scrollTop = ui.log.scrollHeight
}

function updateCounters(): void {
  const capped = renderedRows >= MAX_ROWS ? ' (max)' : ''
  const held = heldCount > 0 ? ` · ${heldCount} on hold` : ''
  ui.count.textContent = `${renderedRows}${capped} of ${store.entries.length} entries${held}`
  ui.pause.textContent = paused ? `Resume${heldCount > 0 ? ` (${heldCount})` : ''}` : 'Pause'
  for (const level of LEVELS) {
    const counter = ui.levels.querySelector(`[data-level="${level}"] .count`)
    if (counter) counter.textContent = String(store.countOf(level))
  }
}

function applyFilters(): void {
  window.clearTimeout(filterTimer)
  filter = compileFilter(settings, hiddenUpToId)
  ui.search.parentElement?.classList.toggle('invalid', filter.error !== null)
  ui.error.textContent = filter.error ?? ''
  saveFilterSettings(settings)
  renderAll()
}

function scheduleFilters(): void {
  window.clearTimeout(filterTimer)
  filterTimer = window.setTimeout(applyFilters, FILTER_DELAY_MS)
}

function resetEntries(): void {
  store.clear()
  heldCount = 0
  hiddenUpToId = 0
  filter = compileFilter(settings, hiddenUpToId)
}

function setPaused(value: boolean): void {
  paused = value
  ui.pause.classList.toggle('on', paused)
  if (!paused && heldCount > 0) renderAll()
  else updateCounters()
}

function setFollowing(value: boolean): void {
  following = value
  ui.follow.classList.toggle('on', following)
  if (following) scrollToEnd()
}

function addLoggerTerm(term: string): void {
  const terms = splitTerms(settings.loggers)
  if (!terms.includes(term)) terms.push(term)
  settings.loggers = terms.join(', ')
  ui.loggers.value = settings.loggers
  applyFilters()
}

/**
 * Formats how long ago something happened, in a compact way.
 *
 * @param timestamp - Epoch milliseconds.
 * @returns Text such as `now`, `12s ago` or `3 min ago`.
 */
function timeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  return `${Math.round(seconds / 3600)} h ago`
}

function sourceFromHash(): string {
  return decodeURIComponent(location.hash.slice(1))
}

function showStatus(status: SourceStatus): void {
  ui.file.textContent = status.file
  ui.file.title = status.file
  const live = status.exists && Date.now() - status.modifiedAt < LIVE_WINDOW_MS
  ui.connection.className = `connection ${live ? 'live' : 'idle'}`
  ui.connection.title = live ? 'Receiving output' : `No new output since ${timeAgo(status.modifiedAt)}`
}

function connect(name: string): void {
  events?.close()
  events = new EventSource(`/api/events?source=${encodeURIComponent(name)}`)

  events.addEventListener('status', (event) => showStatus(JSON.parse(event.data) as SourceStatus))
  events.addEventListener('init', (event) => {
    resetEntries()
    store.add(JSON.parse(event.data) as LogEntry[])
    renderAll()
  })
  events.addEventListener('entries', (event) => receiveEntries(JSON.parse(event.data) as LogEntry[]))
  events.addEventListener('reset', () => {
    resetEntries()
    showDivider(`New run started at ${new Date().toLocaleTimeString()}`)
    updateCounters()
  })
  events.addEventListener('open', () => {
    ui.error.textContent = filter.error ?? ''
  })
  events.addEventListener('error', () => {
    ui.connection.className = 'connection offline'
    ui.connection.title = 'Viewer unreachable, retrying'
    ui.error.textContent = 'Lost the connection to the viewer, retrying…'
  })
}

function selectSource(name: string): void {
  currentSource = name
  ui.source.value = name
  document.title = `${name} · springtail`
  if (sourceFromHash() !== name) history.replaceState(null, '', `#${encodeURIComponent(name)}`)
  resetEntries()
  renderAll()
  connect(name)
}

function updateSourceOptions(sources: SourceStatus[]): void {
  const byName = new Map(sources.map((source) => [source.name, source]))
  const names = [...byName.keys()].sort()
  const shown = [...ui.source.options].map((option) => option.value)
  if (names.join('/') !== shown.join('/')) {
    ui.source.replaceChildren(...names.map((name) => new Option(name, name)))
  }
  for (const option of ui.source.options) {
    const source = byName.get(option.value)
    if (source) option.textContent = `${source.name}  ·  ${timeAgo(source.modifiedAt)}`
  }
}

/**
 * Picks the project to show: the one in the URL, then the current one, then the most recently written.
 *
 * @param sources - Known sources, most recently written first.
 * @returns The project name, or `undefined` when there are no logs.
 */
function preferredSource(sources: SourceStatus[]): string | undefined {
  const names = sources.map((source) => source.name)
  const candidates = [sourceFromHash(), currentSource]
  return candidates.find((name) => name !== null && names.includes(name)) ?? names[0]
}

async function refreshSources(): Promise<void> {
  let response: SourcesResponse
  try {
    response = (await (await fetch('/api/sources', { cache: 'no-store' })).json()) as SourcesResponse
  } catch {
    return
  }

  updateSourceOptions(response.sources)
  const target = preferredSource(response.sources)
  if (target === undefined) {
    ui.file.textContent = `No logs in ${response.directory}`
    showPlaceholder(
      'No logs yet. Run <code>springtail watch</code> in a project folder, or pipe output into <code>springtail capture</code>.',
    )
    return
  }
  ui.source.value = target
  if (target !== currentSource) selectSource(target)
}

function buildLevelChips(): void {
  for (const level of LEVELS) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'chip'
    chip.dataset.level = level
    chip.title = 'Click to show or hide · double click to show only this level'
    chip.innerHTML = `${level}<span class="count">0</span>`
    chip.addEventListener('click', () => toggleLevel(level))
    chip.addEventListener('dblclick', () => soloLevel(level))
    ui.levels.append(chip)
  }
  syncLevelChips()
}

function toggleLevel(level: LogLevel): void {
  if (!settings.levels.delete(level)) settings.levels.add(level)
  syncLevelChips()
  scheduleFilters()
}

function soloLevel(level: LogLevel): void {
  const isAlreadySolo = settings.levels.size === 1 && settings.levels.has(level)
  settings.levels = new Set(isAlreadySolo ? LEVELS : [level])
  syncLevelChips()
  scheduleFilters()
}

function syncLevelChips(): void {
  for (const chip of ui.levels.querySelectorAll<HTMLElement>('.chip')) {
    chip.classList.toggle('on', settings.levels.has(chip.dataset.level as LogLevel))
  }
}

function bindSearchToggle(button: HTMLButtonElement, option: 'caseSensitive' | 'regex'): void {
  button.classList.toggle('on', settings[option])
  button.addEventListener('click', () => {
    settings[option] = !settings[option]
    button.classList.toggle('on', settings[option])
    applyFilters()
  })
}

function onLogClick(event: MouseEvent): void {
  const target = event.target as HTMLElement
  const row = target.closest('.row')
  const entry = row ? rowEntries.get(row) : undefined
  if (!row || !entry) return

  if (target.classList.contains('logger')) {
    addLoggerTerm(event.altKey ? `-${entry.logger}` : entry.logger)
    return
  }
  if (window.getSelection()?.toString()) return

  const open = row.classList.toggle('open')
  row.innerHTML = rowHtml(entry, open, filter.highlight)
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement) {
    if (event.key === 'Escape') event.target.blur()
    return
  }
  if (event.key === '/') {
    event.preventDefault()
    ui.search.focus()
  } else if (event.key.toLowerCase() === 'p') {
    setPaused(!paused)
  } else if (event.key === 'End') {
    setFollowing(true)
  }
}

function bindControls(): void {
  ui.search.value = settings.search
  ui.loggers.value = settings.loggers
  ui.search.addEventListener('input', () => {
    settings.search = ui.search.value
    scheduleFilters()
  })
  ui.loggers.addEventListener('input', () => {
    settings.loggers = ui.loggers.value
    scheduleFilters()
  })
  bindSearchToggle(ui.caseToggle, 'caseSensitive')
  bindSearchToggle(ui.regexToggle, 'regex')

  ui.pause.addEventListener('click', () => setPaused(!paused))
  ui.follow.addEventListener('click', () => setFollowing(!following))
  ui.expand.addEventListener('click', () => {
    expandAll = !expandAll
    ui.expand.textContent = expandAll ? 'Collapse' : 'Expand'
    renderAll()
  })
  ui.clear.addEventListener('click', () => {
    hiddenUpToId = store.last?.id ?? 0
    applyFilters()
  })

  ui.log.addEventListener('scroll', () => {
    const atEnd = ui.log.scrollHeight - ui.log.scrollTop - ui.log.clientHeight < FOLLOW_THRESHOLD_PX
    if (atEnd !== following) setFollowing(atEnd)
  })
  ui.log.addEventListener('click', onLogClick)
  ui.source.addEventListener('change', () => selectSource(ui.source.value))
  document.addEventListener('keydown', onKeyDown)
  window.addEventListener('hashchange', () => {
    const name = sourceFromHash()
    const known = [...ui.source.options].some((option) => option.value === name)
    if (known && name !== currentSource) selectSource(name)
  })
}

buildLevelChips()
bindControls()
applyFilters()
void refreshSources()
window.setInterval(() => void refreshSources(), SOURCES_REFRESH_MS)
