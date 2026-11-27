import type { AppConfig } from '../config'
import type { BackpackRow } from '../douyu/api'

export interface ExpiringSelection {
  candidates: BackpackRow[]
  /** 本次可赠送总数 = 临期候选数量之和 */
  budget: number
  earliestExpireTime?: number
  skippedNotExpiring: number
  skippedNoExpireTime: number
}

export interface AllocationItem {
  roomId: number
  count: number
}

/**
 * 只挑选即将过期的荧光棒；没有 expireTime 的行不参与赠送（避免误送长期库存）。
 */
export function selectExpiringRows(rows: BackpackRow[], thresholdHours: number, now = Date.now()): ExpiringSelection {
  const positiveRows = rows.filter((row) => row.count > 0)
  const withExpire = positiveRows.filter((row) => row.expireTime !== undefined)
  const earliestExpireTime = withExpire.length
    ? Math.min(...withExpire.map((row) => row.expireTime as number))
    : undefined

  const thresholdMs = thresholdHours * 60 * 60 * 1000
  const candidates = withExpire.filter((row) => (row.expireTime as number) - now <= thresholdMs)

  return {
    candidates,
    budget: candidates.reduce((sum, row) => sum + row.count, 0),
    earliestExpireTime,
    skippedNotExpiring: withExpire.length - candidates.length,
    skippedNoExpireTime: positiveRows.length - withExpire.length,
  }
}

function splitEvenly(budget: number, roomIds: number[]): AllocationItem[] {
  const rooms = Array.from(new Set(roomIds.filter((roomId) => Number.isInteger(roomId) && roomId > 0)))
  if (budget <= 0 || rooms.length === 0) {
    return []
  }
  const base = Math.floor(budget / rooms.length)
  let remainder = budget - base * rooms.length
  return rooms
    .map((roomId) => {
      const extra = remainder > 0 ? 1 : 0
      remainder -= extra
      return { roomId, count: base + extra }
    })
    .filter((item) => item.count > 0)
}

function allocateFixed(budget: number, config: AppConfig): AllocationItem[] {
  const entries = Object.entries(config.roomAllocations).map(([roomId, item]) => ({
    roomId: Number(roomId),
    count: item.count as number,
  }))
  const fixedSum = entries.reduce((sum, item) => sum + (item.count === -1 ? 0 : item.count), 0)
  if (fixedSum > budget) {
    throw new Error(`荧光棒数量不足：当前临期 ${budget} 个，配置需求 ${fixedSum} 个`)
  }
  const remainderRoom = entries.find((item) => item.count === -1)

  return entries
    .map((item) => ({
      roomId: item.roomId,
      count: item.count === -1 ? budget - fixedSum : item.count,
    }))
    .filter((item) => item.count > 0)
}

function allocateWeighted(budget: number, config: AppConfig): AllocationItem[] {
  const entries = Object.entries(config.roomAllocations)
    .map(([roomId, item]) => ({ roomId: Number(roomId), weight: item.weight ?? 0 }))
    .filter((item) => item.weight > 0)
    .sort((a, b) => a.weight - b.weight)
  if (entries.length === 0) {
    throw new Error('weighted 模式下没有权重大于 0 的房间')
  }

  const totalWeight = entries.reduce((sum, item) => sum + item.weight, 0)
  let assigned = 0
  return entries
    .map((item, index) => {
      if (index === entries.length - 1) {
        return { roomId: item.roomId, count: budget - assigned }
      }
      const count = Math.floor((item.weight / totalWeight) * budget)
      assigned += count
      return { roomId: item.roomId, count }
    })
    .filter((item) => item.count > 0)
}

/**
 * 未配置房间时，按粉丝牌房间平均分配（等价于参考项目的“平均分配模式”）。
 */
export function allocate(budget: number, config: AppConfig, fallbackRoomIds: number[]): AllocationItem[] {
  if (budget <= 0) {
    return []
  }
  const configured = Object.keys(config.roomAllocations)
  if (configured.length === 0) {
    return splitEvenly(budget, fallbackRoomIds)
  }
  return config.allocationMode === 'weighted' ? allocateWeighted(budget, config) : allocateFixed(budget, config)
}