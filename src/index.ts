import { loadConfig } from './config'
import { API_REQUIRED_KEYS, DANMU_REQUIRED_KEYS, describeCookie, loadCookie, missingKeys } from './douyu/cookie'
import { GLOW_STICK_GIFT_ID, getBackpackRows, getFansRoomIds, sendGift, sleep } from './douyu/api'
import { collectGlowStick } from './douyu/collect'
import { allocate, selectExpiringRows } from './strategy/allocate'
import { notify } from './notify'
import { error, errorMessage, log, warn } from './logger'

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

async function main(): Promise<void> {
  const config = loadConfig(process.argv.slice(2))
  const cookie = loadCookie()

  const missingApi = missingKeys(cookie, API_REQUIRED_KEYS)
  if (missingApi.length > 0) {
    throw new Error(`Cookie 缺少主站字段: ${missingApi.join(', ')}，请重新登录斗鱼并同步 Cookie`)
  }
  log(
    `账号 ${describeCookie(cookie)}，模式 ${config.dryRun ? 'DRY-RUN（只读）' : '正式执行'}，临期阈值 ${config.thresholdHours} 小时`,
  )

  // 1. 粉丝牌房间（失败不阻塞，配置了房间仍可继续）
  const fansRooms = await getFansRoomIds(cookie).catch((err: unknown) => {
    warn(`获取粉丝牌房间失败：${errorMessage(err)}`)
    return [] as number[]
  })
  if (fansRooms.length > 0) {
    log(`粉丝牌房间 ${fansRooms.length} 个：${fansRooms.join(', ')}`)
  }

  const configuredRooms = Object.keys(config.roomAllocations).map(Number)
  const targetRooms = configuredRooms.length > 0 ? configuredRooms : fansRooms
  if (targetRooms.length === 0) {
    throw new Error('没有可赠送的房间：请配置 roomAllocations，或确认账号有粉丝牌')
  }
  if (fansRooms.length > 0) {
    const withoutBadge = configuredRooms.filter((roomId) => !fansRooms.includes(roomId))
    if (withoutBadge.length > 0) {
      warn(`以下房间没有粉丝牌，赠送不会增加亲密度：${withoutBadge.join(', ')}`)
    }
  }

  // 2. 领取当天荧光棒（弹幕 WS，失败不阻塞）
  if (config.collectGift) {
    const missingDanmu = missingKeys(cookie, DANMU_REQUIRED_KEYS)
    if (config.dryRun) {
      log('DRY-RUN：跳过荧光棒领取')
    } else if (missingDanmu.length > 0) {
      warn(`Cookie 缺少弹幕登录字段（${missingDanmu.join(', ')}），跳过领取，按现有背包执行`)
    } else {
      try {
        await collectGlowStick(cookie, targetRooms[0])
        log(`已在房间 ${targetRooms[0]} 触发荧光棒领取`)
        await sleep(1500)
      } catch (err) {
        warn(`领取荧光棒失败：${errorMessage(err)}`)
      }
    }
  }

  // 3. 查询背包并筛选临期
  const rows = await getBackpackRows(cookie, targetRooms)
  const glowRows = rows.filter((row) => row.giftId === GLOW_STICK_GIFT_ID)
  const totalGlow = glowRows.reduce((sum, row) => sum + row.count, 0)
  const selection = selectExpiringRows(glowRows, config.thresholdHours)
  log(
    `背包荧光棒 ${totalGlow} 个；临期候选 ${selection.candidates.length} 行 / 共 ${selection.budget} 个（未临期跳过 ${selection.skippedNotExpiring}，无过期时间跳过 ${selection.skippedNoExpireTime}）`,
  )

  const summary: string[] = [`账号 ${describeCookie(cookie)}`, `背包荧光棒 ${totalGlow} 个，临期 ${selection.budget} 个`]
  if (selection.earliestExpireTime) {
    const hours = Math.max(0, (selection.earliestExpireTime - Date.now()) / 3600000)
    log(`最早过期时间 ${formatTime(selection.earliestExpireTime)}（约 ${hours.toFixed(1)} 小时后）`)
    summary.push(`最早过期 ${formatTime(selection.earliestExpireTime)}（约 ${hours.toFixed(1)} 小时后）`)
  }

  if (selection.budget <= 0) {
    log('当前没有进入临期阈值的荧光棒，跳过赠送')
    await notify(config, '斗鱼荧光棒任务：无需赠送', summary.join('\n'))
    return
  }

  // 4. 分配并赠送
  const plan = allocate(selection.budget, config, targetRooms)
  const planText = plan.map((item) => `${item.roomId}×${item.count}`).join(', ')
  log(`赠送计划：${planText}`)
  summary.push(`赠送计划 ${planText}`)

  if (config.dryRun) {
    log('DRY-RUN：不执行实际赠送')
    await notify(config, '斗鱼荧光棒任务：DRY-RUN', summary.join('\n'))
    return
  }

  const didCache = new Map<number, string>()
  const failures: string[] = []
  for (const item of plan) {
    try {
      await sendGift(cookie, { roomId: item.roomId, giftId: GLOW_STICK_GIFT_ID, count: item.count }, didCache)
      log(`房间 ${item.roomId} 赠送 ${item.count} 个成功`)
    } catch (err) {
      const message = `房间 ${item.roomId} 赠送 ${item.count} 个失败：${errorMessage(err)}`
      failures.push(message)
      warn(message)
    }
    await sleep(config.requestIntervalMs)
  }

  summary.push(`赠送结果：成功 ${plan.length - failures.length}/${plan.length} 个房间`)
  if (failures.length > 0) {
    summary.push(...failures)
    await notify(config, '斗鱼荧光棒任务：部分失败', summary.join('\n'))
    throw new Error(`${failures.length} 个房间赠送失败`)
  }

  await notify(config, '斗鱼荧光棒任务：完成', summary.join('\n'))
  log('任务完成')
}

main().catch(async (err: unknown) => {
  const message = errorMessage(err)
  error(`任务失败：${message}`)
  try {
    const config = loadConfig(process.argv.slice(2))
    await notify(config, '斗鱼荧光棒任务：失败', message)
  } catch {
    // 配置无法读取时放弃推送
  }
  process.exitCode = 1
})