export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' | 'SQL' | 'OUT'

export interface LogEntry {
  id: number
  time: string
  level: LogLevel
  pid: string
  thread: string
  context: string
  logger: string
  message: string
}

export interface SourceStatus {
  name: string
  file: string
  exists: boolean
  size: number
  modifiedAt: number
  total: number
}

export interface SourcesResponse {
  directory: string
  sources: SourceStatus[]
}
