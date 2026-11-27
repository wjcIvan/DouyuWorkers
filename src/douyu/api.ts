import { getCookieValue } from './cookie'

/** 荧光棒礼物 ID */
export const GLOW_STICK_GIFT_ID = 268

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const REQUEST_TIMEOUT_MS = 15000
/** 背包接口需要一个有效房间号；这里放两个长期存在的官方房间兜底 */
const DEFAULT_BACKPACK_ROOM_IDS = [217331, 557171]

export interface BackpackRow {
  giftId: number
  name: string
  count: number
  expireTime?: number
}

export interface GiftTarget {
  roomId: number
  giftId: number
  count: number
}

function buildHeaders(cookie: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Cookie: cookie,
    'User-Agent': USER_AGENT,
    Referer: 'https://www.douyu.com/',
    Origin: 'https://www.douyu.com',
    ...extra,
  }
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

/** 秒级时间戳统一转毫秒 */
function toTimestamp(value: unknown): number | undefined {
  const parsed = toNumber(value)
  if (parsed === undefined || parsed <= 0) {
    return undefined
  }
  return parsed < 1e12 ? parsed * 1000 : parsed
}

function normalizeRow(item: Record<string, unknown>): BackpackRow {
  return {
    giftId: toNumber(item.id) ?? 0,
    name: typeof item.name === 'string' ? item.name : '',
    count: toNumber(item.count) ?? 0,
    expireTime: toTimestamp(
      item.expireTime ?? item.expire_time ?? item.expireAt ?? item.expiresAt ?? item.met ?? item.endTime,
    ),
  }
}

function buildBackpackEndpoints(candidateRoomIds: number[]): string[] {
  const roomIds = Array.from(
    new Set([...candidateRoomIds.filter((rid) => Number.isInteger(rid) && rid > 0), ...DEFAULT_BACKPACK_ROOM_IDS]),
  )
  return roomIds.flatMap((rid) => [
    `https://www.douyu.com/japi/prop/backpack/web/v5?rid=${rid}`,
    `https://www.douyu.com/japi/prop/backpack/web/v1?rid=${rid}`,
  ])
}

export async function getBackpackRows(cookie: string, candidateRoomIds: number[] = []): Promise<BackpackRow[]> {
  let lastError: Error | null = null

  for (const url of buildBackpackEndpoints(candidateRoomIds)) {
    try {
      const res = await fetch(url, { headers: buildHeaders(cookie), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (!res.ok) {
        lastError = new Error(`背包接口 HTTP ${res.status}`)
        continue
      }
      const data = (await res.json()) as Record<string, any>
      const errorCode = toNumber(data?.error)
      if (errorCode !== undefined && errorCode !== 0) {
        lastError = new Error(`背包接口返回错误码 ${errorCode}: ${data?.msg ?? '无错误信息'}`)
        continue
      }
      const list = data?.data?.list
      if (!Array.isArray(list)) {
        lastError = new Error('背包接口返回数据格式异常')
        continue
      }
      return list
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map(normalizeRow)
        .filter((row) => row.giftId > 0)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error('获取背包明细失败')
}

/** 粉丝牌列表页是 HTML，直接抓 data-fans-room */
export async function getFansRoomIds(cookie: string): Promise<number[]> {
  const res = await fetch('https://www.douyu.com/member/cp/getFansBadgeList', {
    headers: buildHeaders(cookie),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`获取粉丝牌列表失败: HTTP ${res.status}`)
  }
  const html = await res.text()
  const rooms = Array.from(html.matchAll(/data-fans-room="(\d+)"/g)).map((match) => Number(match[1]))
  const unique = Array.from(new Set(rooms))
  if (unique.length === 0 && !html.includes('fans-badge-list')) {
    throw new Error('获取粉丝牌列表失败：未找到粉丝牌表格，Cookie 可能已失效')
  }
  return unique
}

/** 送礼接口要求带上目标房间的 owner_uid（did），从直播间页面提取 */
export async function getOwnerUid(cookie: string, roomId: number): Promise<string> {
  const res = await fetch(`https://www.douyu.com/${roomId}`, {
    headers: buildHeaders(cookie),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`获取房间 ${roomId} 页面失败: HTTP ${res.status}`)
  }
  const html = await res.text()
  const matched = html.match(/owner_uid\s*=\s*(.*?);/) ?? html.match(/owner_uid:(.*?),/)
  const did = matched?.[1]?.replace(/['"\s]/g, '')
  if (!did) {
    throw new Error(`获取房间 ${roomId} 的 did 失败`)
  }
  return did
}

export async function sendGift(
  cookie: string,
  target: GiftTarget,
  didCache: Map<number, string> = new Map(),
): Promise<void> {
  const sid = getCookieValue(cookie, 'acf_uid')
  const dy = getCookieValue(cookie, 'dy_did')
  if (!sid || !dy) {
    throw new Error('Cookie 缺少 acf_uid(sid) 或 dy_did(dy)，无法赠送')
  }

  let did = didCache.get(target.roomId)
  if (!did) {
    did = await getOwnerUid(cookie, target.roomId)
    didCache.set(target.roomId, did)
  }

  const body = new URLSearchParams({
    rid: String(target.roomId),
    prop_id: String(target.giftId),
    num: String(target.count),
    sid,
    did,
    dy,
  })

  const res = await fetch('https://www.douyu.com/member/prop/send', {
    method: 'POST',
    headers: buildHeaders(cookie, { 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: body.toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, any>
  if (!res.ok) {
    throw new Error(`送礼接口 HTTP ${res.status}`)
  }
  const errorCode = toNumber(data?.error)
  if (errorCode !== undefined && errorCode !== 0) {
    throw new Error(`送礼失败: ${data?.msg ?? `错误码 ${errorCode}`}`)
  }
  const code = toNumber(data?.code ?? data?.status_code)
  if (code !== undefined && code !== 0 && code !== 200) {
    throw new Error(`送礼失败: ${data?.msg ?? `状态码 ${code}`}`)
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}