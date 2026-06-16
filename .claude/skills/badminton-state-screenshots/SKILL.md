---
name: badminton-state-screenshots
description: 给「客乐羽」羽毛球小程序的各活动状态(报名/分组/比赛/赛后)在测试环境一键切换并截图。当用户想"截各状态的图""做状态截图测试""看某个 stage 长什么样""验证 UI 改动效果"时使用。
---

# 客乐羽 · 各状态截图测试

测试环境用 `DEV_SECRET` 开放的 `/api/dev/session-stage` 端点把活动场次瞬间切到任意阶段,
再用本机 Chrome 的 headless 模式截图存盘。无需等真实定时器、无需登录。

## 一键运行(推荐)

```bash
bash .claude/skills/badminton-state-screenshots/shot.sh
```

- 默认截 4 个状态到 `~/Downloads/badminton-states-<时间戳>/`,结束后把环境恢复到 `signup_open`(可报名)。
- 指定输出目录:`shot.sh ~/Downloads/我的目录`
- 只截部分:`shot.sh ~/Downloads/我的目录 "signup_open finished"`
- 跑完把 `OUTDIR=...` 路径告诉用户即可。

## 补充状态(候补 + 各弹窗)

主 5 状态之外的视角,用 `extra-shots.sh` 一键出 6 张:

```bash
bash .claude/skills/badminton-state-screenshots/extra-shots.sh
```

覆盖:① 候补中(报名进候补)② 报名失败/候补未晋升(分组阶段)③ 完整分组弹窗 ④ 查看排名弹窗 ⑤ 查看详细(轮转详情)⑥ 查看其他场次。原理:多报 2 人造出候补用户;`cdp-shot.mjs` 的第 7 个参数 `clickText` 会在截图前点击"文字包含该串"的按钮以弹出抽屉。

单独截某个弹窗:
```bash
node cdp-shot.mjs "$BASE" out.png "$COOKIE" 500 1180 9222 "完整分组"
```

## 配置来源(脚本自动读取,一般不用管)

- `BASE_URL` —— 缺省 `https://klookbadminton.duckdns.org`(可用 env 覆盖)
- `DEV_SECRET` —— 缺省从 `~/Downloads/e2e-tests/.env` 读取(可用 env 覆盖)

## 可用状态 / 对应进度条段

| stage 值        | 进度条 | 文件名前缀 |
|-----------------|--------|-----------|
| `signup_open`   | 报名   | `1-报名`  |
| `signup_closed` | 分组   | `2-分组`  |
| `in_progress`   | 比赛   | `3-比赛`  |
| `finished`      | 赛后   | `4-赛后`  |

> 注:服务器旧构建只有这 4 个;本地代码新增的 `preview`(预告)需重新部署后端才可用。

## 关键坑(脚本已处理,手动跑时务必注意)

1. **每次截图用独立 `--user-data-dir`**(`mktemp -d`)。复用同一 profile 会触发 SingletonLock,后续 Chrome 静默失败、不出图。
2. **必须加 `--no-proxy-server`**。否则 headless 继承系统/内网(Klook)代理 PAC,直接 `ERR_CONNECTION_TIMED_OUT`(而 curl 走直连不受影响)。
3. **macOS 没有 `timeout` 命令**(会 127 报错)。要限时就 `cmd & pid=$!; ... ; kill -9 $pid`。
4. **`比赛`/`赛后` 页面有 20 秒轮询**(多人协作计分),headless 可能不自动退出。脚本做法:后台启动 → 轮询等待截图文件出现(最多 25s)→ 强杀进程。
5. 切 stage 用的是相对时间(如 `signup_close_at = NOW()+4h`),会随真实时钟漂移,**切完要立刻截**,别在中间穿插长操作。
6. 截出来是**未登录(公开)视图**;要"参赛者本人视角"需注入 dev 登录态(`/api/dev/login` 的 `bm_user` cookie),脚本暂未做。

## 手动等价命令(单张)

```bash
BASE=https://klookbadminton.duckdns.org
DEV=$(grep '^DEV_SECRET=' ~/Downloads/e2e-tests/.env | cut -d= -f2)
curl -s -X POST $BASE/api/dev/session-stage -H 'content-type: application/json' \
  -d "{\"secret\":\"$DEV\",\"stage\":\"signup_open\"}"
P=$(mktemp -d /tmp/c.XXXX)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --user-data-dir="$P" --no-proxy-server --window-size=440,1100 \
  --virtual-time-budget=6000 --force-device-scale-factor=2 \
  --screenshot=/tmp/shot.png "$BASE"; rm -rf "$P"
```
