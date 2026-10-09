import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join } from 'node:path'
import type { SourcesResponse } from '../shared/log-entry.js'
import type { LogSource } from './log-source.js'
import type { SourceRegistry } from './source-registry.js'

const STATUS_INTERVAL_MS = 5_000
const RECONNECT_DELAY_MS = 2_000
const PUBLIC_FILES = new Set(['/index.html', '/styles.css', '/favicon.svg'])
const SCRIPT_PATH = /^\/js\/([\w-]+\.js)$/
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
}

export interface AssetDirectories {
  publicDirectory: string
  scriptsDirectory: string
}

/**
 * Creates the HTTP server behind the viewer: static page, JSON source list and one event stream per log.
 *
 * @param registry - Log sources to expose.
 * @param assets - Where the page and its compiled scripts live.
 * @returns The server, not listening yet.
 */
export function createViewerServer(registry: SourceRegistry, assets: AssetDirectories): Server {
  return createServer((request, response) => {
    handleRequest(registry, assets, request, response).catch((error: unknown) => {
      if (!response.headersSent) response.writeHead(500)
      response.end(String(error))
    })
  })
}

async function handleRequest(
  registry: SourceRegistry,
  assets: AssetDirectories,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/api/sources') {
    await registry.scan()
    const body: SourcesResponse = { directory: registry.directory, sources: registry.statuses() }
    sendJson(response, body)
    return
  }

  if (url.pathname === '/api/events') {
    await registry.scan()
    const source = registry.get(url.searchParams.get('source') ?? '')
    if (!source) {
      response.writeHead(404).end('Unknown source')
      return
    }
    await source.poll()
    streamSource(source, response)
    return
  }

  const pagePath = url.pathname === '/' ? '/index.html' : url.pathname
  if (PUBLIC_FILES.has(pagePath)) {
    await sendFile(response, join(assets.publicDirectory, pagePath))
    return
  }

  const script = SCRIPT_PATH.exec(url.pathname)?.[1]
  if (script) {
    await sendFile(response, join(assets.scriptsDirectory, script))
    return
  }

  response.writeHead(404).end('Not found')
}

function streamSource(source: LogSource, response: ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  response.write(`retry: ${RECONNECT_DELAY_MS}\n\n`)
  writeEvent(response, 'status', source.status())
  writeEvent(response, 'init', source.entries)

  const unsubscribe = source.subscribe((event) => {
    if (event.type === 'closed') response.end()
    else writeEvent(response, event.type, event.type === 'entries' ? event.entries : null)
  })
  const statusTimer = setInterval(() => writeEvent(response, 'status', source.status()), STATUS_INTERVAL_MS)

  response.on('close', () => {
    clearInterval(statusTimer)
    unsubscribe()
  })
}

function writeEvent(response: ServerResponse, name: string, data: unknown): void {
  response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function sendFile(response: ServerResponse, path: string): Promise<void> {
  const content = await readFile(path).catch(() => null)
  if (content === null) {
    response.writeHead(404).end('Not found')
    return
  }
  const contentType = CONTENT_TYPES[extname(path)] ?? 'application/octet-stream'
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  response.end(content)
}
