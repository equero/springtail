import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { logDirectory, parsePort, viewerPort } from '../shared/settings.js'
import { createViewerServer } from './http-server.js'
import { SourceRegistry } from './source-registry.js'

const POLL_INTERVAL_MS = 250
const SCAN_INTERVAL_MS = 2_000

const { values } = parseArgs({ options: { dir: { type: 'string' }, port: { type: 'string' } } })
const directory = resolve(values.dir ?? logDirectory)
const port = values.port === undefined ? viewerPort : parsePort(values.port)

if (port === undefined) {
  console.error(`Invalid port: ${values.port}`)
  process.exit(1)
}

await mkdir(directory, { recursive: true })
const registry = new SourceRegistry(directory)
await registry.scan()

const server = createViewerServer(registry, {
  publicDirectory: fileURLToPath(new URL('../../public/', import.meta.url)),
  scriptsDirectory: fileURLToPath(new URL('../web/', import.meta.url)),
})

server.on('error', (error) => {
  console.error(`springtail viewer could not start: ${error.message}`)
  process.exit(1)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`springtail viewer on http://localhost:${port}`)
  console.log(`Reading logs from ${directory}`)
  setInterval(() => void registry.pollAll(), POLL_INTERVAL_MS)
  setInterval(() => void registry.scan(), SCAN_INTERVAL_MS)
})
