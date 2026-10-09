import type { LogLevel } from '../shared/log-entry.js'
import { LEVELS } from './entry-store.js'
import type { FilterSettings } from './filters.js'

const STORAGE_KEY = 'springtail.filters'

type StoredSettings = Partial<Record<keyof FilterSettings, unknown>>

/**
 * Restores the filters from the last visit.
 *
 * @returns Saved settings, or the defaults when nothing usable is stored.
 */
export function loadFilterSettings(): FilterSettings {
  const stored = readStoredSettings()
  const savedLevels = Array.isArray(stored.levels) ? stored.levels.filter(isLevel) : [...LEVELS]
  return {
    levels: new Set(savedLevels),
    search: typeof stored.search === 'string' ? stored.search : '',
    caseSensitive: stored.caseSensitive === true,
    regex: stored.regex === true,
    loggers: typeof stored.loggers === 'string' ? stored.loggers : '',
  }
}

export function saveFilterSettings(settings: FilterSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, levels: [...settings.levels] }))
  } catch {
    return
  }
}

function readStoredSettings(): StoredSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return typeof stored === 'object' && stored !== null ? stored : {}
  } catch {
    return {}
  }
}

/**
 * Tells whether a stored value is a known level.
 *
 * @param value - Any value read from storage.
 * @returns `true` when it is one of the viewer levels.
 */
function isLevel(value: unknown): value is LogLevel {
  return LEVELS.includes(value as LogLevel)
}
