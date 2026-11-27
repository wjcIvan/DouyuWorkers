export type Logger = (message: string) => void

function timestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

export const log: Logger = (message) => {
  console.log(`[${timestamp()}] ${message}`)
}

export const warn: Logger = (message) => {
  console.warn(`[${timestamp()}] [WARN] ${message}`)
}

export const error: Logger = (message) => {
  console.error(`[${timestamp()}] [ERROR] ${message}`)
}

export function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}