import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_VIEWER_PORT = 8090

export const homeDirectory = process.env.SPRINGTAIL_HOME || join(homedir(), '.springtail')
export const logDirectory = join(homeDirectory, 'logs')
export const watchedFilesPath = join(homeDirectory, 'watched.json')
export const viewerPidFile = join(homeDirectory, 'viewer.pid')
export const viewerPort = parsePort(process.env.SPRINGTAIL_PORT) ?? DEFAULT_VIEWER_PORT

/**
 * Parses a TCP port number.
 *
 * @param value - Raw text, usually from an environment variable or a CLI flag.
 * @returns The port, or `undefined` when the text is not a valid port.
 */
export function parsePort(value: string | undefined): number | undefined {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : undefined
}
