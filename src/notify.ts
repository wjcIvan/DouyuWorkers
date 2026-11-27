import type { AppConfig } from './config'
import { warn } from './logger'

/**
 * 推送失败不影响主任务结果，只记录告警。
 */
export async function notify(config: AppConfig, title: string, body: string): Promise<void> {
  const { type, key } = config.notify
  if (type === 'none' || !key) {
    return
  }

  try {
    if (type === 'serverchan') {
      const res = await fetch(`https://sctapi.ftqq.com/${key}.send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ title, desp: body }).toString(),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        warn(`Server酱推送失败: HTTP ${res.status}`)
      }
      return
    }

    const base = key.replace(/\/+$/, '')
    const res = await fetch(`${base}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      warn(`Bark 推送失败: HTTP ${res.status}`)
    }
  } catch (err) {
    warn(`推送失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}