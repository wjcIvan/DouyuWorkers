// ==UserScript==
// @name         斗鱼 Cookie 同步（DouyuWorker）
// @namespace    https://github.com/
// @version      1.2.4
// @description  每 24 小时把斗鱼 Cookie 同步到私有仓库 .github/douyu_cookie.txt，供 GitHub Actions 读取
// @match        https://www.douyu.com/*
// @grant        GM_cookie
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// ==/UserScript==

(function () {
  'use strict'

  const COOKIE_FILE_PATH = '.github/douyu_cookie.txt'
  const AUTO_SYNC_INTERVAL_HOURS = 24
  const REQUIRED_COOKIE_KEYS = ['acf_uid', 'acf_auth', 'acf_stk', 'dy_did']
  const SIGNATURE_COOKIE_KEYS = ['acf_uid', 'acf_auth', 'acf_stk', 'acf_ltkid', 'dy_did']

  function toast(message) {
    const old = document.getElementById('dy-worker-toast')
    if (old) old.remove()
    const node = document.createElement('div')
    node.id = 'dy-worker-toast'
    node.textContent = message
    node.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:10001;padding:10px 16px;border-radius:6px;' +
      'background:#333;color:#fff;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3)'
    document.body.appendChild(node)
    setTimeout(() => node.remove(), 3000)
  }

  function getAllCookies() {
    return new Promise((resolve) => {
      if (typeof GM_cookie === 'undefined') {
        resolve(document.cookie)
        return
      }
      GM_cookie.list({ url: 'https://www.douyu.com/' }, (cookies, err) => {
        if (err || !cookies) {
          resolve(document.cookie)
          return
        }
        resolve(cookies.map((item) => `${item.name}=${item.value}`).join('; '))
      })
    })
  }

  function request(options) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        ...options,
        onload: (res) => resolve(res),
        onerror: () => resolve(null),
      })
    })
  }

  function parseCookie(cookie) {
    const map = {}
    String(cookie || '')
      .split(/;\s*/)
      .forEach((pair) => {
        const index = pair.indexOf('=')
        if (index > 0) {
          map[pair.slice(0, index)] = pair.slice(index + 1)
        }
      })
    return map
  }

  function cookieSignature(cookie) {
    const map = parseCookie(cookie)
    return SIGNATURE_COOKIE_KEYS.map((key) => `${key}=${map[key] || ''}`).join('; ')
  }

  function getRemoteFile(token, repo) {
    return request({
      method: 'GET',
      url: `https://api.github.com/repos/${repo}/contents/${COOKIE_FILE_PATH}`,
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    }).then((res) => {
      if (!res || res.status !== 200) {
        return { sha: null, content: '' }
      }
      const data = JSON.parse(res.responseText)
      const content = data.content ? atob(String(data.content).replace(/\s/g, '')) : ''
      return { sha: data.sha, content }
    })
  }

  async function sync(cookie, auto) {
    const token = GM_getValue('gh_token', '')
    const repo = GM_getValue('gh_repo', '')
    if (!token || !repo) {
      if (!auto) {
        toast('请先在脚本菜单里完成「设置」')
        setup()
      }
      return
    }
    if (auto) {
      const last = GM_getValue('last_sync_time', 0)
      if ((Date.now() - last) / 3600000 < AUTO_SYNC_INTERVAL_HOURS) {
        return
      }
    }

    try {
      const map = parseCookie(cookie || (await getAllCookies()))
      const remote = await getRemoteFile(token, repo)
      if (remote.content) {
        const remoteMap = parseCookie(remote.content)
        REQUIRED_COOKIE_KEYS.forEach((key) => {
          if (!map[key] && remoteMap[key]) {
            map[key] = remoteMap[key]
          }
        })
      }
      const missing = REQUIRED_COOKIE_KEYS.filter((key) => !map[key])
      if (missing.length > 0) {
        throw new Error(`Cookie 不完整，缺少 ${missing.join(', ')}（请重新登录斗鱼后再试）`)
      }
      const finalCookie = Object.keys(map)
        .map((key) => `${key}=${map[key]}`)
        .join('; ')
      if (remote.content && cookieSignature(remote.content) === cookieSignature(finalCookie)) {
        GM_setValue('last_sync_time', Date.now())
        if (!auto) {
          toast('Cookie 无变化，已跳过同步')
        }
        return
      }
      const content = btoa(unescape(encodeURIComponent(finalCookie)))
      const res = await request({
        method: 'PUT',
        url: `https://api.github.com/repos/${repo}/contents/${COOKIE_FILE_PATH}`,
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        data: JSON.stringify({ message: 'chore: update douyu cookie [skip ci]', content, sha: remote.sha }),
      })
      if (!res || (res.status !== 200 && res.status !== 201)) {
        throw new Error(`上传失败，HTTP ${res ? res.status : '网络错误'}`)
      }
      GM_setValue('last_sync_time', Date.now())
      toast('Cookie 已同步到 GitHub')
    } catch (err) {
      if (!auto) {
        toast(`同步失败：${err.message}`)
      }
    }
  }

  function setup() {
    const token = prompt('GitHub Token（fine-grained，仅需该仓库 Contents: Read and write）:', GM_getValue('gh_token', ''))
    if (!token) return
    const repo = prompt('仓库路径（例如 yourname/DouyuWorker）:', GM_getValue('gh_repo', ''))
    if (!repo) return
    GM_setValue('gh_token', token)
    GM_setValue('gh_repo', repo)
    sync(null, false)
  }

  GM_registerMenuCommand('立即同步', () => sync(null, false))
  GM_registerMenuCommand('手动粘贴 Cookie', () => {
    const cookie = prompt('请粘贴 Cookie:')
    if (cookie && cookie.trim()) {
      sync(cookie.trim(), false)
    }
  })
  GM_registerMenuCommand('设置', setup)

  setTimeout(() => sync(null, true), 5000)
})()