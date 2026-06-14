<div align="center">

# 🏸 客乐羽

### Klook 羽毛球社团 · Lark 集成小程序

一站式管理周末羽毛球活动:报名、分组、计分、排名、海报

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Lark](https://img.shields.io/badge/Lark-Open_Platform-00D6B9)](https://open.larksuite.com/)

</div>

---

## ✨ 为什么需要这个

每周组织羽毛球活动总会遇到这些麻烦:

- 👥 谁报名了?谁是候补?候补怎么晋升?
- 🎯 谁打竞技场?谁打休闲场?怎么平衡水平?
- 📊 比分谁来记?多人填会不会冲突?
- 🏆 谁是 MVP?排名怎么算?
- 📅 下周还来吗?怎么提醒?

**客乐羽** 把这些自动化,让组织者专注打球。

---

## 🚀 核心功能

<table>
<tr>
<td width="50%">

### 🤖 自动化机器人
- 每周一 10:30 自动推送报名卡片到群
- 报名/候补/晋升全自动
- 私信通知:候补晋升、报名提醒
- 一键订阅"下周提醒我"

</td>
<td>

### 🎮 全流程状态机
5 段进度条覆盖整周:
1. **预告** · 下一场预览
2. **报名** · 名额 / 候补
3. **分组** · 自动分配场地
4. **比赛** · LIVE 计分轮转
5. **赛后** · 战绩 / 排名 / 海报

</td>
</tr>
<tr>
<td>

### 🏸 4 人双打轮转
- 每个场地自动生成轮换表
- 每人遇到不同搭档 / 对手
- 实时计分,多人协作 (20s 同步)
- 自动判定胜负 / 净胜分

</td>
<td>

### 📈 段位 + 战绩
- 基于胜率 / 净胜分 / 历史的 MMR 算法
- 7 段位:萌新 → 王者 → 星耀 → 璀璨星辰
- 个人战绩页:总场数 / 胜率 / 常搭档
- 海报一键生成,发群秀战绩

</td>
</tr>
</table>

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| **前端** | React 18 · Vite · TypeScript · 原生 CSS |
| **后端** | Node.js · Fastify · TypeScript |
| **数据** | PostgreSQL 16 |
| **部署** | Docker Compose · Caddy (自动 HTTPS) |
| **集成** | Lark Open Platform (OAuth · Bot Message) |
| **测试** | Vitest (25 个 API 集成测试) |

---

## 📦 仓库结构

```
.
├── backend/             # Fastify API 服务
│   ├── src/             # TypeScript 源码
│   │   ├── routes/      # API 路由
│   │   ├── services/    # 业务逻辑(报名/分组/轮转/段位)
│   │   ├── scheduler.ts # 定时任务
│   │   └── lark.ts      # Lark SDK 封装
│   ├── migrations/      # PostgreSQL DDL (3 个迁移)
│   └── scripts/         # 工具脚本
│
├── frontend/            # React Web 应用
│   └── src/
│       ├── pages/       # ActivityPage / PersonalPage
│       ├── components/  # 5 stage components / modal / progress
│       └── api.ts       # API client
│
├── e2e-tests/           # API 集成测试 (vitest)
│   └── tests/           # 25 个测试 case
│
├── docker-compose.yml
├── .env.example
└── DEPLOYMENT.md        # 部署指南
```

---

## 🚀 快速开始

### 前置准备

- Linux 服务器 (Ubuntu 22+) + 公网域名
- Docker 24+ & Docker Compose v2+
- Lark 开放平台应用 (App ID / Secret / 群 chat_id)

### 3 步部署

```bash
# 1. 克隆代码(私有仓库,服务器需先配只读 deploy key,详见 DEPLOYMENT.md)
git clone git@github.com:fitchsao/badminton.git
cd badminton

# 2. 配置环境变量(参考 .env.example 注释填值)
cp .env.example .env
echo "COOKIE_HMAC_SECRET=$(openssl rand -hex 32)" >> .env
echo "ADMIN_TRIGGER_TOKEN=$(openssl rand -hex 24)" >> .env
nano .env  # 填入 LARK_APP_ID / LARK_APP_SECRET / APP_BASE_URL 等

# 3. 启动
docker compose up -d
docker compose logs -f backend
```

详细步骤(包括 Caddy 反代 / HTTPS / 数据库备份)见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

### 本地开发

```bash
# 后端 (端口 3000)
cd backend && npm install && npm run dev

# 前端 (端口 5173)
cd frontend && npm install && npm run dev

# 测试
cd e2e-tests && npm install && npm test
```

---

## 🧪 测试覆盖

```bash
cd e2e-tests && npm test
```

```
✓ tests/00_setup.test.ts       (3)  ✓ 健康检查 / 登录态
✓ tests/01_signup.test.ts      (4)  ✓ 报名 / 取消 / 重复报名
✓ tests/02_waitlist.test.ts    (2)  ✓ 候补 / 晋升
✓ tests/03_score.test.ts       (4)  ✓ 比分填写 / 校验
✓ tests/04_rating.test.ts      (4)  ✓ 段位计算
✓ tests/05_subscription.test.ts (4) ✓ 订阅 / 通知
✓ tests/06_admin.test.ts       (4)  ✓ Admin 配置

Test Files  7 passed (7)
Tests       25 passed (25)
Duration    ~15s
```

---

## 🎮 在测试环境模拟全流程

> ⚠️ 以下全部依赖 `DEV_SECRET`。**只在测试环境开启**:`.env` 里设一个随机值(`openssl rand -hex 16`)并重启 backend;**生产环境必须留空**,否则任何人都能伪造登录。

开启后会出现一组 `/api/dev/*` 调试端点,可以**伪登录任意用户、一键重置数据、把活动瞬间切到任意阶段** —— 无需等到周一 10:30,也不需要多个飞书账号,即可在测试企业里跑通所有报名流程。

| 调试端点 | 作用 |
|---|---|
| `POST /api/dev/reset` | 重置 mock 数据(预置 15 个报名:11 正式 + 4 候补,留 5 个正式位) |
| `POST /api/dev/session-stage` | 把活动切到指定阶段:`preview` / `signup_open` / `signup_closed` / `in_progress` / `finished` |
| `POST /api/dev/login` | 伪登录任意用户(`openId` + `name`),跳过飞书 OAuth |

### 方式 A:自动化(推荐,一条命令跑 25 个用例)

```bash
cd e2e-tests
cp .env.example .env          # 填 BASE_URL + DEV_SECRET
npm install && npm test
```

覆盖:报名 / 取消 / 重报、候补晋升、比分、段位、订阅、Admin 权限。详见 [e2e-tests/README.md](./e2e-tests/README.md)。

### 方式 B:手动模拟(curl,边点边看)

```bash
BASE=https://你的测试域名
DEV=你的_DEV_SECRET

# ① 重置数据 + ② 切到"报名中"
curl -s -X POST $BASE/api/dev/reset         -H 'content-type: application/json' -d "{\"secret\":\"$DEV\"}"
curl -s -X POST $BASE/api/dev/session-stage -H 'content-type: application/json' -d "{\"secret\":\"$DEV\",\"stage\":\"signup_open\"}"
```

**模拟「报名 → 取消 → 重报」**
```bash
# 伪登录为测试用户 alice(cookie 存进 jar 文件)
curl -s -c jar -X POST $BASE/api/dev/login -H 'content-type: application/json' \
  -d "{\"secret\":\"$DEV\",\"openId\":\"test_user_alice\",\"name\":\"测试-Alice\"}"

SID=$(curl -s -b jar $BASE/api/sessions/current | jq .session.id)    # 当前场次 id

# 报名(首次必须带 gender),再取消
curl -s -b jar -X POST $BASE/api/sessions/$SID/signup -H 'content-type: application/json' \
  -d '{"preferredCourtType":"竞技","gender":"男"}'
curl -s -b jar -X POST $BASE/api/sessions/$SID/cancel
```

**模拟「填满 → 进候补 → 晋升」**
```bash
# 连报 6 个新用户:前 5 个占满正式位,第 6 个自动进候补
for i in 1 2 3 4 5 6; do
  curl -s -c jar_$i -X POST $BASE/api/dev/login -H 'content-type: application/json' \
    -d "{\"secret\":\"$DEV\",\"openId\":\"test_user_fill$i\",\"name\":\"测试-Fill$i\"}" >/dev/null
  curl -s -b jar_$i -X POST $BASE/api/sessions/$SID/signup -H 'content-type: application/json' \
    -d '{"preferredCourtType":"竞技","gender":"男"}' >/dev/null
done
# 让某个正式用户取消 → 第一位候补自动晋升,再查 /api/sessions/current 的 signups 验证 isWaitlist
```

**模拟「比赛 → 计分 → 排行」**
```bash
# 推进到"进行中"(自动生成分组 + 轮转表)
curl -s -X POST $BASE/api/dev/session-stage -H 'content-type: application/json' \
  -d "{\"secret\":\"$DEV\",\"stage\":\"in_progress\"}"

# 取一场比赛 id 填分
curl -s -b jar $BASE/api/sessions/current | jq '.matches[0]'
curl -s -b jar -X POST $BASE/api/matches/<matchId>/score -H 'content-type: application/json' \
  -d '{"scoreA":15,"scoreB":12}'

# 推进到"已结束",看排行榜
curl -s -X POST $BASE/api/dev/session-stage -H 'content-type: application/json' \
  -d "{\"secret\":\"$DEV\",\"stage\":\"finished\"}"
curl -s -b jar $BASE/api/sessions/$SID/leaderboard | jq
```

### 方式 C:在测试企业里走真实 UI

想验证真实的飞书登录 + 机器人卡片(而非伪登录):

1. 用测试企业里的 admin 账号(飞书 OAuth 登录后)在 **Admin 面板的"运维"入口**手动推送报名卡片(对应 `POST /api/admin/ops/trigger-signup`),无需等周一。
2. 用测试企业的真实成员点卡片 → 走飞书 OAuth → 在网页里报名。
3. 阶段切换仍可用方式 B 的 `/api/dev/session-stage` 控制(真实定时器要等到周二活动时间)。

> **数据安全**:dev 端点只操作 `mock_user_*` / `test_user_*` 前缀的假用户,`reset` 不会动真实数据。

---

## 📸 截图

> 截图待补充 - 实际使用界面包括:
>
> - 报名页(场地偏好 + 性别选择)
> - 候补名单 (16/16 + 候补 #5)
> - 双打轮转 (LIVE + 比分填写)
> - 个人战绩 (88% 胜率 + 常搭档 top 5)
> - 排行榜海报 (一键生成发群)

---

## 🗺 开发路线

- [x] V1: MVP 报名机器人
- [x] V2: 场地分组 + 4 人轮转
- [x] V3: 段位 / 战绩 / 海报 / 订阅
- [x] V3.5: 5 段状态机 UX 重构
- [x] V3.9: 多人协作计分 (20s 同步)
- [ ] V4: 上架 Lark 应用市场 (公开版)
- [ ] V4.1: 数据看板 / 运营指标

---

## 🤝 贡献

这是 Klook 内部项目。如果你是 Klook 同事想加入开发:

1. 找 [@fitchsao](https://github.com/fitchsao) 沟通需求
2. Fork → 改 → PR
3. 必须跑通 `cd e2e-tests && npm test`

---

## 📄 License

Internal use only · © 2026 Fitch @ Klook

---

<div align="center">

**🏸 Built with 💜 for the Klook badminton crew 🏸**

</div>
