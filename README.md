# 斗鱼荧光棒自动助手

每天自动领取斗鱼荧光棒，并把**即将过期**的荧光棒自动送给指定直播间。运行在 GitHub Actions 上，不用开电脑、不用买服务器。

> 适合人群：完全没用过 GitHub Actions 的小白，照着本文一步步点即可。

---

## 目录

- [一、它能做什么](#一它能做什么)
- [二、原理（30 秒看懂）](#二原理30-秒看懂)
- [三、准备工作](#三准备工作)
- [四、第一步：创建你自己的仓库](#四第一步创建你自己的仓库)
- [五、第二步：创建 GitHub Token](#五第二步创建-github-token)
- [六、第三步：安装 Tampermonkey 和同步脚本](#六第三步安装-tampermonkey-和同步脚本)
- [七、第四步：让脚本把 Cookie 同步到仓库](#七第四步让脚本把-cookie-同步到仓库)
- [八、第五步：启用并测试 GitHub Actions](#八第五步启用并测试-github-actions)
- [九、第六步：修改运行时间](#九第六步修改运行时间)
- [十、第七步：配置房间号（重点）](#十第七步配置房间号重点)
- [十一、第八步（可选）：消息推送](#十一第八步可选消息推送)
- [十二、常见问题](#十二常见问题)
- [十三、安全提醒](#十三安全提醒)
- [十四、本地运行（可选，给会 Node 的人）](#十四本地运行可选给会-node-的人)

---

## 一、它能做什么

- 每天自动登录斗鱼，**领取当天免费的荧光棒**
- 自动检查背包，**只送 24 小时内就要过期的荧光棒**（长期库存不动）
- 可以送给**一个或多个**直播间，数量按你的配置分配
- 定时运行（默认北京时间每天 12:00），失败了可在 GitHub 页面看日志
- 可选推送通知（Server 酱 / Bark）

**做不到的事**：不会自动登录斗鱼、不会自动过验证码，登录态由你浏览器里的 Cookie 提供。

---

## 二、原理（30 秒看懂）

```
你的浏览器（已登录斗鱼）
        │  油猴脚本每 24 小时把 Cookie 写入仓库
        ▼
你的私有仓库 .github/douyu_cookie.txt
        │  GitHub Actions 每天定时读取
        ▼
GitHub 服务器运行本程序 → 领荧光棒 → 筛选临期 → 送礼
```

所以整套东西只需要两样：**一个私有仓库** + **浏览器里的油猴脚本**。

---

## 三、准备工作

| 需要 | 说明 |
| --- | --- |
| GitHub 账号 | 没有就注册一个，免费 |
| 浏览器 | Chrome / Edge / Firefox 均可 |
| Tampermonkey | 浏览器扩展，用来同步 Cookie |
| 斗鱼账号 | 需要已登录，且有粉丝牌的直播间 |

**不需要**：安装 Node.js、买服务器、开电脑挂机。

---

## 四、第一步：创建你自己的仓库

> 因为仓库里会保存你的斗鱼 Cookie，**必须创建为 Private（私有）**。

1. 打开本项目的 GitHub 页面：`https://github.com/wjcIvan/DouyuWorkers`
2. 点击右上角绿色的 **Use this template** → **Create a new repository**
   - 如果没看到这个按钮，可以点 **Code → Download ZIP**，解压后自己新建仓库上传，效果一样
3. 填写：
   - **Repository name**：随便起，例如 `douyu-workers`
   - **Visibility**：选择 **Private**（重要！）
4. 点 **Create repository**

创建完成后，你的仓库地址形如：

```
https://github.com/你的用户名/douyu-workers
```

后面所有步骤里出现的 `你的用户名/douyu-workers` 都要替换成这个。

---

## 五、第二步：创建 GitHub Token

这个 Token 只给油猴脚本用，用来把 Cookie 写进你的仓库。

1. 打开 `https://github.com/settings/personal-access-tokens/new`
   （也可以手动进入：GitHub 头像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token）
2. 填写：
   - **Token name**：`douyu-cookie-sync`
   - **Expiration**：选 `No expiration`（不会过期，省事）
   - **Repository access**：选 **Only select repositories** → 选中你刚创建的 `douyu-workers`
3. 展开 **Permissions** → **Repository permissions**：
   - 找到 **Contents**，改成 **Read and write**
   - 其他权限全部保持 `No access`
4. 点最下面的 **Generate token**
5. 复制页面上的 `github_pat_xxxxxxxx`（**只显示这一次**，关掉就看不到了）

> 安全提示：这个 Token 只能读写你这一个仓库，泄露风险可控。但请不要把它发到任何公开的地方。

---

## 六、第三步：安装 Tampermonkey 和同步脚本

### 6.1 安装 Tampermonkey

- Chrome / Edge：打开扩展商店搜索 **Tampermonkey** 安装
- Firefox：打开附加组件页面搜索 **Tampermonkey** 安装

安装后在浏览器右上角能看到它的图标（灰色方块或猴头）。

### 6.2 安装同步脚本（三种方式任选）

**方式 A：从 URL 安装（推荐）**

1. 点 Tampermonkey 图标 → **管理面板**
2. 切到 **实用工具** 标签
3. 在「从 URL 安装」里粘贴下面地址，点 **安装**：

```
https://raw.githubusercontent.com/你的用户名/douyu-workers/main/userscript/douyu-cookie-sync.user.js
```

（把 `你的用户名/douyu-workers` 换成你自己的仓库）

**方式 B：复制粘贴**

1. 在你的仓库里打开 `userscript/douyu-cookie-sync.user.js`
2. 点右上角 **Raw**，全选复制（Ctrl+A、Ctrl+C）
3. Tampermonkey → 管理面板 → **+**（添加新脚本）
4. 删掉模板内容，粘贴刚才的代码，按 **Ctrl+S** 保存

**方式 C：直接打开 Raw 链接**，若页面出现 Tampermonkey 的安装界面，点 **安装** 即可。

### 6.3 必须修改的油猴设置（很多人卡在这一步）

脚本需要读取斗鱼的登录 Cookie（`acf_auth` 是 HttpOnly 的），必须放开权限：

1. Tampermonkey → **管理面板** → **设置**
2. 顶部 **配置模式**：从「新手」改成 **高级**（不切高级，下面的选项根本看不到）
3. 切到 **安全** 标签
4. 找到 **允许脚本访问 Cookie** → 改成 **全部**
5. 页面底部点 **保存**

> 如果跳过这一步，同步时会提示「Cookie 不完整，缺少 acf_auth」。

---

## 七、第四步：让脚本把 Cookie 同步到仓库

1. 用同一个浏览器打开 `https://www.douyu.com/`，**确认右上角是自己的账号（已登录）**
2. 点 Tampermonkey 图标 → **斗鱼 Cookie 同步（DouyuWorker）** → **设置**
3. 依次填写：
   - **仓库**：`你的用户名/douyu-workers`（例如 `wjcIvan/douyu-workers`，注意是斜杠分隔，不带 `https://`）
   - **Token**：第二步复制的 `github_pat_...`
4. 点 **确定/保存**，脚本会自动同步一次
5. 右下角提示 **「Cookie 已同步到 GitHub」** 即成功

**验证**：回到你的仓库，应该能看到一条提交：

```
chore: update douyu cookie [skip ci]
```

文件位置：`.github/douyu_cookie.txt`

**以后还要手动点吗？**

不用。只要你在浏览器里打开过斗鱼，且距离上次同步超过 24 小时，脚本会自动同步一次。Cookie 没变化时不会产生多余提交。

> 想立刻同步：油猴图标 → 斗鱼 Cookie 同步 → **立即同步**。

---

## 八、第五步：启用并测试 GitHub Actions

1. 打开你的仓库 → **Actions** 标签页
2. 如果是模板创建的新仓库，工作流会自动启用；若页面提示需要确认，点 **I understand my workflows, go ahead and enable them**
3. 左侧选择 **Douyu Daily Job** → 右侧点 **Run workflow** → 再点绿色 **Run workflow**
4. 等十几秒刷新页面，点进这次运行记录 → 点 **run** 步骤查看日志

日志正常的样子：

```
[2026/11/27 12:03:11] 账号 acf_uid=12345678，模式 正式执行，临期阈值 24 小时
[2026/11/27 12:03:12] 粉丝牌房间 3 个：52887, 99999, 88888
[2026/11/27 12:03:12] 已在房间 52887 触发荧光棒领取
[2026/11/27 12:03:15] 背包荧光棒 153 个；临期候选 1 行 / 共 3 个（未临期跳过 2，无过期时间跳过 0）
[2026/11/27 12:03:15] 赠送计划：52887×3
[2026/11/27 12:03:18] 房间 52887 赠送 3 个成功
[2026/11/27 12:03:18] 任务完成
```

如果看到「当前没有进入临期阈值的荧光棒，跳过赠送」，说明没有快过期的荧光棒，属于正常情况。

---

## 九、第六步：修改运行时间

定时配置在 `.github/workflows/daily.yml` 里，改这一行：

```yaml
- cron: '0 4 * * *'
```

**注意：这里用的是 UTC 时间，不是北京时间**。北京时间 = UTC + 8。

常用换算（直接抄）：

| 北京时间 | 对应的 cron |
| --- | --- |
| 每天 08:00 | `0 0 * * *` |
| 每天 12:00 | `0 4 * * *` |
| 每天 20:00 | `0 12 * * *` |
| 每天 23:00 | `0 15 * * *` |
| 每天 00:30 | `30 16 * * *`（UTC 是前一天 16:30） |

换算方法：**UTC 小时 = 北京小时 − 8**，如果结果是负数就加 24（此时 UTC 是前一天）。

其他说明：

- `0 4 * * *` 五个位置依次是「分 时 日 月 星期」，`*` 表示每天/每月都跑
- GitHub 的定时任务在高峰期可能**延迟几分钟到几十分钟**，属正常现象
- 修改后记得点 **Commit changes** 提交

---

## 十、第七步：配置房间号（重点）

### 10.1 怎么拿到房间号

打开任意直播间，地址栏 `https://www.douyu.com/52887` 里的数字 **52887** 就是房间号。

### 10.2 创建配置文件

仓库里默认只有 `config.example.json`（示例）。你需要在仓库根目录新建 `config.json`：

1. 打开你的仓库 → 点 **Add file** → **Create new file**
2. 文件名填：`config.json`
3. 粘贴下面的内容并按需修改
4. 点 **Commit changes**

**最小可用配置（把临期荧光棒全部送给 52887）**：

```json
{
  "collectGift": true,
  "thresholdHours": 24,
  "allocationMode": "fixed",
  "roomAllocations": {
    "52887": { "count": -1 }
  },
  "requestIntervalMs": 2000,
  "notify": { "type": "none", "key": "" }
}
```

### 10.3 多房间怎么配

**方式一：固定数量（fixed）**

```json
"roomAllocations": {
  "52887": { "count": 3 },
  "99999": { "count": 1 }
}
```

含义：给 52887 送 3 个、99999 送 1 个。临期总数不够 4 个时会直接报错（不会乱送）。

**方式二：固定 + 剩余全部（fixed + `-1`）**

```json
"roomAllocations": {
  "52887": { "count": 2 },
  "99999": { "count": -1 }
}
```

含义：先给 52887 送 2 个，剩下的全给 99999。
`-1` 表示「吃掉剩余」，**整个配置里只能出现一次**。

**方式三：按比例分（weighted）**

```json
"allocationMode": "weighted",
"roomAllocations": {
  "52887": { "weight": 3 },
  "99999": { "weight": 1 }
}
```

含义：按 3 : 1 的比例分配。注意 `weighted` 模式下要写 `weight`，不能写 `count`。

**方式四：什么都不配**

`"roomAllocations": {}`（空对象）时，会自动把临期荧光棒**平均分给所有你有粉丝牌的直播间**。

### 10.4 字段说明

| 字段 | 说明 | 常用值 |
| --- | --- | --- |
| `collectGift` | 是否领取当天荧光棒 | `true` |
| `thresholdHours` | 只送「N 小时内过期」的荧光棒 | `24`（一天内到期） |
| `allocationMode` | 分配方式 | `fixed` 或 `weighted` |
| `roomAllocations` | 房间号 → 数量/权重 | 见上面例子 |
| `requestIntervalMs` | 每次送礼之间的间隔（毫秒） | `2000` |
| `notify.type` | 推送方式 | `none` / `serverchan` / `bark` |
| `notify.key` | 推送密钥 | 见第八步 |

### 10.5 注意事项

- 送给**自己没有粉丝牌**的房间，礼物照样会送出，但不会增加亲密度，日志里会有提醒
- `thresholdHours` 调大（例如 `48`）会送得更积极，调小（例如 `6`）更保守
- 修改 `config.json` 后提交即可，下一次定时运行生效，不需要重新配置其他东西

---

## 十一、第八步（可选）：消息推送

不配置就跳过，不影响主流程。

进入仓库 **Settings → Secrets and variables → Actions**：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Variables | `NOTIFY_TYPE` | `serverchan` 或 `bark` |
| Secrets | `NOTIFY_KEY` | 对应的密钥 |

- **Server 酱**：去 `sct.ftqq.com` 获取 SendKey，`NOTIFY_KEY` 填这个 Key
- **Bark**：`NOTIFY_KEY` 填你的地址，例如 `https://api.day.app/你的Key`

推送内容包含：账号、背包数量、临期数量、赠送计划、成功/失败结果。

---

## 十二、常见问题

**Q1：Actions 报「Cookie 缺少主站字段: ...，请重新登录斗鱼并同步 Cookie」**

斗鱼登录态过期了。打开斗鱼确认已登录 → 油猴菜单 →「立即同步」→ 再手动 Run 一次 Actions。

**Q2：油猴提示「Cookie 不完整，缺少 acf_auth」**

没放开 Cookie 权限。见 [6.3](#63-必须修改的油猴设置很多人卡在这一步)：
配置模式改「高级」→ 安全 → 允许脚本访问 Cookie → **全部** → 保存 → 刷新斗鱼页面 → 立即同步。

**Q3：Actions 到点没运行**

- 确认 **Actions** 标签页里工作流是启用状态
- cron 是 UTC，不是北京时间
- GitHub 免费额度下定时任务可能延迟几十分钟
- **仓库连续 60 天没有任何提交时，GitHub 会自动停用定时任务**，此时进 Actions 页面点一次 **Run workflow** 即可恢复

**Q4：报「没有可赠送的房间」**

`config.json` 的 `roomAllocations` 是空的，且账号没有任何粉丝牌。填一个房间号即可。

**Q5：报「荧光棒数量不足：当前临期 X 个，配置需求 Y 个」**

`fixed` 模式下配置的固定数量总和超过了临期数量。把数量改小，或改用 `-1`。

**Q6：日志显示赠送失败 / 401 / 请登录**

Cookie 失效，重新按第四步同步一次 Cookie。

**Q7：会不会有风险？**

程序只做「领荧光棒 + 送礼」，请求间隔 2 秒，频率接近正常用户。但任何自动化都存在账号风险，请自行判断，风险自负。

**Q8：一定要装油猴吗？**

不一定。你也可以手动把 Cookie 写进仓库的 `.github/douyu_cookie.txt`，或配置 Secret `DOUYU_COOKIE`。缺点是不会自动更新，Cookie 过期后需要手动再改一次。

**Q9：私有仓库跑 Actions 要收费吗？**

免费账号每月有 2000 分钟私有仓库额度，本项目每次运行 1 分钟左右，一天一次，完全够用。

---

## 十三、安全提醒

- **Cookie 等于账号登录态**，任何人拿到都能操作你的账号。所以仓库**必须保持 Private**
- 如果你不小心把仓库改成了 Public，请立刻：① 删除 `.github/douyu_cookie.txt` ② 在斗鱼退出登录再重新登录（让旧 Cookie 失效）
- GitHub Token 只授予了「单个仓库的 Contents 读写」，不要扩大权限
- 本项目不收集、不上传任何用户数据，所有请求都由你自己的 GitHub Actions 发起

---

## 十四、本地运行（可选，给会 Node 的人）

需要 Node.js 20 以上：

```bash
npm install

# 只读模式：只查询背包和临期情况，不送礼、不领奖
npm run dry-run

# 正式执行
npm run job
```

本地运行时，Cookie 的读取顺序是：

1. `.github/douyu_cookie.txt`（文件存在且非空时优先）
2. 环境变量 `DOUYU_COOKIE`

也可以用环境变量临时覆盖配置：

| 环境变量 | 作用 |
| --- | --- |
| `DOUYU_COOKIE` | 直接指定 Cookie |
| `DOUYU_COOKIE_FILE` | 指定 Cookie 文件路径 |
| `CONFIG_FILE` | 指定配置文件路径 |
| `DOUYU_THRESHOLD_HOURS` | 覆盖临期阈值 |
| `DOUYU_INTERVAL_MS` | 覆盖请求间隔 |
| `NOTIFY_TYPE` / `NOTIFY_KEY` | 覆盖推送配置 |
| `DRY_RUN=1` | 等价于 `--dry-run` |

### 目录结构

```
.
├── .github/
│   ├── workflows/daily.yml      # 定时任务配置（cron 在这里改）
│   └── douyu_cookie.txt         # 你的 Cookie（脚本自动写入，勿公开）
├── src/
│   ├── index.ts                 # 主流程
│   ├── config.ts                # 配置加载与校验
│   ├── notify.ts                # 消息推送
│   ├── logger.ts                # 日志
│   ├── douyu/
│   │   ├── api.ts               # 背包、粉丝牌、送礼接口
│   │   ├── collect.ts           # 弹幕 WebSocket 领取荧光棒
│   │   └── cookie.ts            # Cookie 解析与加载
│   └── strategy/allocate.ts     # 临期筛选与房间分配
├── userscript/
│   └── douyu-cookie-sync.user.js  # 油猴同步脚本
├── config.example.json          # 配置示例（复制为 config.json 使用）
└── package.json
```

---

## 免责声明

本项目仅供学习与个人使用，与斗鱼官方无关。使用本工具产生的一切后果由使用者自行承担，请遵守平台用户协议。