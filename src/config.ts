import fs from 'node:fs'
import path from 'node:path'

export type AllocationMode = 'fixed' | 'weighted'
export type NotifyType = 'none' | 'serverchan' | 'bark'

export interface RoomAllocation {
  count?: number
  weight?: number
}

export interface AppConfig {
  collectGift: boolean
  thresholdHours: number
  allocationMode: AllocationMode
  roomAllocations: Record<string, RoomAllocation>
  requestIntervalMs: number
  dryRun: boolean
  notify: {
    type: NotifyType
    key: string
  }
}

const DEFAULTS: AppConfig = {
  collectGift: true,
  thresholdHours: 24,
  allocationMode: 'fixed',
  roomAllocations: {},
  requestIntervalMs: 2000,
  dryRun: false,
  notify: { type: 'none', key: '' },
}

function readConfigFile(): Partial<AppConfig> {
  const file = process.env.CONFIG_FILE || path.resolve(process.cwd(), 'config.json')
  if (!fs.existsSync(file)) {
    return {}
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppConfig>
  } catch (err) {
    throw new Error(`配置文件解析失败 ${file}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function envNumber(name: string): number | undefined {
  const raw = process.env[name]
  if (!raw) {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function validate(config: AppConfig): void {
  if (!Number.isFinite(config.thresholdHours) || config.thresholdHours <= 0) {
    throw new Error('thresholdHours 必须是大于 0 的数字')
  }
  if (!Number.isFinite(config.requestIntervalMs) || config.requestIntervalMs < 0) {
    throw new Error('requestIntervalMs 不能为负数')
  }
  if (!['fixed', 'weighted'].includes(config.allocationMode)) {
    throw new Error('allocationMode 只能是 fixed 或 weighted')
  }
  if (!['none', 'serverchan', 'bark'].includes(config.notify.type)) {
    throw new Error('notify.type 只能是 none / serverchan / bark')
  }

  const entries = Object.entries(config.roomAllocations)
  for (const [roomId, item] of entries) {
    if (!/^\d+$/.test(roomId) || Number(roomId) <= 0) {
      throw new Error(`roomAllocations 中的房间号不合法: ${roomId}`)
    }
    if (config.allocationMode === 'fixed') {
      if (typeof item.count !== 'number' || !Number.isInteger(item.count) || item.count === 0) {
        throw new Error(`房间 ${roomId} 的 count 必须是整数且不能为 0（-1 表示吃掉剩余）`)
      }
    } else if (typeof item.weight !== 'number' || item.weight < 0) {
      throw new Error(`房间 ${roomId} 的 weight 必须是不小于 0 的数字`)
    }
  }

  if (config.allocationMode === 'fixed') {
    const remainderRooms = entries.filter(([, item]) => item.count === -1)
    if (remainderRooms.length > 1) {
      throw new Error('fixed 模式下最多只能有一个房间配置 count: -1')
    }
  } else if (entries.length > 0) {
    const totalWeight = entries.reduce((sum, [, item]) => sum + (item.weight ?? 0), 0)
    if (totalWeight <= 0) {
      throw new Error('weighted 模式下权重总和必须大于 0')
    }
  }
}

export function loadConfig(argv: string[] = []): AppConfig {
  const fromFile = readConfigFile()
  const config: AppConfig = {
    ...DEFAULTS,
    ...fromFile,
    roomAllocations: fromFile.roomAllocations ?? DEFAULTS.roomAllocations,
    notify: { ...DEFAULTS.notify, ...(fromFile.notify ?? {}) },
  }

  const thresholdHours = envNumber('DOUYU_THRESHOLD_HOURS')
  if (thresholdHours !== undefined) {
    config.thresholdHours = thresholdHours
  }
  const intervalMs = envNumber('DOUYU_INTERVAL_MS')
  if (intervalMs !== undefined) {
    config.requestIntervalMs = intervalMs
  }
  if (process.env.NOTIFY_TYPE) {
    config.notify.type = process.env.NOTIFY_TYPE as NotifyType
  }
  if (process.env.NOTIFY_KEY) {
    config.notify.key = process.env.NOTIFY_KEY
  }
  if (argv.includes('--dry-run') || process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true') {
    config.dryRun = true
  }

  validate(config)
  return config
}