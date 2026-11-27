import crypto from 'node:crypto'
import WebSocket from 'ws'
import { getCookieValue } from './cookie'

const DANMU_WS_URL = 'wss://wsproxy.douyu.com:6672'
const LOGIN_VK_SECRET = "r5*^5;}2#${XF[h+;'./.Q'1;,-]f'p["
const COLLECT_TIMEOUT_MS = 15000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function escapeValue(value: string): string {
  return value.replace(/@/g, '@A').replace(/\//g, '@S')
}

function encodeMessage(params: Record<string, string>): string {
  const payload = Object.entries(params)
    .map(([key, value]) => `${escapeValue(key)}@=${escapeValue(value)}/`)
    .join('')
  return `${payload}\0`
}

function buildPacket(message: string): Buffer {
  const payload = Buffer.from(message, 'utf8')
  const packet = Buffer.alloc(12 + payload.length + 1)
  const length = 9 + payload.length
  packet.writeInt32LE(length, 0)
  packet.writeInt32LE(length, 4)
  packet.writeInt32LE(689, 8)
  payload.copy(packet, 12)
  packet.writeUInt8(0, 12 + payload.length)
  return packet
}

function decodeMessages(data: WebSocket.RawData): string[] {
  const buffer = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)
  return Array.from(buffer.toString('utf8').matchAll(/type@=.*?\0/g), (match) => match[0].slice(0, -1))
}

function randomDeviceId(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  const bytes = crypto.randomBytes(31)
  let suffix = ''
  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length]
  }
  return `b${suffix}`
}

function buildLoginPacket(roomId: string, cookie: string): Buffer {
  const deviceId = randomDeviceId()
  const rt = String(Math.floor(Date.now() / 1000))
  const vk = crypto.createHash('md5').update(`${rt}${LOGIN_VK_SECRET}${deviceId}`).digest('hex')

  const params: Record<string, string> = {
    type: 'loginreq',
    password: '',
    roomid: roomId,
  }
  const cookieMappings: Array<[string, string]> = [
    ['acf_username', 'username'],
    ['acf_ltkid', 'ltkid'],
    ['acf_biz', 'biz'],
    ['acf_stk', 'stk'],
    ['acf_ct', 'ct'],
  ]
  for (const [cookieKey, paramKey] of cookieMappings) {
    const value = getCookieValue(cookie, cookieKey)
    if (value) {
      params[paramKey] = value
    }
  }
  Object.assign(params, {
    devid: deviceId,
    rt,
    pt: '2',
    vk,
    ver: '20180222',
    aver: '219032101',
    dmbt: 'mobile safari',
    dmbv: '11',
  })
  return buildPacket(encodeMessage(params))
}

function buildEnterRoomPacket(roomId: string): Buffer {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return buildPacket(
    encodeMessage({
      type: 'h5ckreq',
      rid: roomId,
      ti: `2501${year}${month}${day}`,
    }),
  )
}

/**
 * 通过弹幕 WebSocket 进入直播间，触发当天荧光棒发放。
 * 替代旧项目里的 Selenium 打开直播间方案，CI 环境可用。
 */
export async function collectGlowStick(cookie: string, roomId: number): Promise<void> {
  const normalizedRoomId = String(roomId).trim()
  if (!/^\d+$/.test(normalizedRoomId)) {
    throw new Error(`无效的房间号: ${normalizedRoomId || '<empty>'}`)
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let loginAccepted = false
    let timer: ReturnType<typeof setTimeout>
    const ws = new WebSocket(DANMU_WS_URL, {
      handshakeTimeout: 10000,
      headers: {
        Cookie: cookie,
        'User-Agent': USER_AGENT,
        Origin: 'https://www.douyu.com',
        Referer: `https://www.douyu.com/${normalizedRoomId}`,
      },
    })

    const finish = (err?: Error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      ws.close()
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    }

    timer = setTimeout(() => finish(new Error('等待弹幕服务器响应超时')), COLLECT_TIMEOUT_MS)

    ws.on('open', () => {
      ws.send(buildLoginPacket(normalizedRoomId, cookie))
    })

    ws.on('message', (data) => {
      for (const message of decodeMessages(data)) {
        if (message.startsWith('type@=loginres')) {
          if (message.includes('roomgroup@=1')) {
            loginAccepted = true
            ws.send(buildEnterRoomPacket(normalizedRoomId))
          } else {
            finish(new Error('弹幕登录鉴权失败，Cookie 可能已失效'))
          }
        }
        if (message.startsWith('type@=h5ckres')) {
          finish()
        }
      }
    })

    ws.on('error', (err) => finish(new Error(`弹幕连接异常: ${err.message}`)))
    ws.on('close', () => {
      if (!settled) {
        finish(new Error(loginAccepted ? '进入房间前连接被关闭' : '登录前连接被关闭'))
      }
    })
  })
}