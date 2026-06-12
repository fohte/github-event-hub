type Level = 'info' | 'warn' | 'error'

export interface LogFields {
  [key: string]: unknown
}

const emit = (level: Level, message: string, fields: LogFields): void => {
  const record = {
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  }
  // Single-line JSON for easy ingestion by Loki/Promtail.
  const line = JSON.stringify(record, (_key, value: unknown) =>
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value,
  )
  const stream = level === 'error' ? process.stderr : process.stdout
  stream.write(line + '\n')
}

export const logger = {
  info(message: string, fields: LogFields = {}): void {
    emit('info', message, fields)
  },
  warn(message: string, fields: LogFields = {}): void {
    emit('warn', message, fields)
  },
  error(message: string, fields: LogFields = {}): void {
    emit('error', message, fields)
  },
}
