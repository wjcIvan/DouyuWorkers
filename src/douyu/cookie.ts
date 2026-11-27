import fs from 'node:fs'
import path from 'node:path'

/** 主站接口（背包/送礼/粉丝牌）必需字段 */
export const API_REQUIRED_KEYS = ['acf_uid', 'acf_stk', 'acf_auth', 'dy_did']

/** 弹幕 WebSocket 登录（领取荧光棒）必需字段 */
export const DANMU_REQUIRED_KEYS = ['acf_username', 'acf_ltkid', 'acf_biz', 'acf_stk', 'acf_ct']

function parseCookie(cookie: string): Record<string, string> {
  return cookie.split(';').reduce<Record<string, string>>((acc, chunk) => {
    const index = chunk.indexOf('=')
    if (index <= 0) {
      return acc
    }
    const name = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (name) {
      acc[name] = value
    }
    return acc
  }, {})
}

export function getCookieValue(cookie: string, name: string): string | undefined {
  return parseCookie(cookie)[name]
}

export function missingKeys(cookie: string, keys: string[]): string[] {
  const parsed = parseCookie(cookie)
  return keys.filter((key) => !parsed[key])
}

/**
 * Cookie 读取优先级：.github/douyu_cookie.txt（浏览器插件自动写入）> 环境变量 DOUYU_COOKIE。
 */
export function loadCookie(): string {
  const file = process.env.DOUYU_COOKIE_FILE || path.resolve(process.cwd(), '.github/douyu_cookie.txt')
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8').trim()
    if (raw) {
      return raw
    }
  }

  const fromEnv = process.env.DOUYU_COOKIE?.trim()
  if (fromEnv) {
    return fromEnv
  }

  throw new Error('未找到 Cookie：请配置 .github/douyu_cookie.txt（插件自动同步）或环境变量 DOUYU_COOKIE')
}

export function describeCookie(cookie: string): string {
  const uid = getCookieValue(cookie, 'acf_uid') ?? '未知'
  return `acf_uid=${uid}`
}