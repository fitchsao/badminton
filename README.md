# 客乐羽 · Klook 羽毛球社团小程序

> Lark 集成的羽毛球活动报名、分组、计分、排名 Web 应用

## 功能概览

- 🏸 周报名机器人(自动周一开放报名)
- 👥 报名名单 + 候补晋升
- 🎯 场地分组(竞技/休闲)
- 🔁 4 人双打轮转 + 实时计分(多人协作)
- 🏆 排行榜 + 海报生成
- 📊 个人战绩 + 段位(MMR)
- 🔔 报名提醒订阅
- 🛠 Admin 配置面板(球场、容量、分数上限等)

## 技术栈

- **后端**: Node.js + Fastify + TypeScript + PostgreSQL
- **前端**: React + Vite + TypeScript
- **部署**: Docker Compose + Caddy (HTTPS)
- **集成**: Lark Open Platform (OAuth, 消息推送)

## 仓库结构

```
.
├── backend/         # Node.js API 服务
│   ├── src/         # TypeScript 源码
│   ├── migrations/  # PostgreSQL DDL
│   └── scripts/     # 工具脚本(mock 数据等)
├── frontend/        # React Web 应用
│   └── src/         # TypeScript + React 源码
├── e2e-tests/       # API 集成测试 (vitest)
├── scripts/         # 部署 / 运维脚本
├── docker-compose.yml
├── .env.example     # 环境变量模板(复制为 .env 后填值)
└── DEPLOYMENT.md    # 部署指南
```

## 快速开始

### 1. 准备 Lark 应用

在 [Lark 开放平台](https://open.larksuite.com/app) 创建自建应用,记录:

- App ID
- App Secret
- 添加 OAuth 重定向 URL: `https://你的域名/auth/callback`
- 权限申请: `im:message`, `contact:user.id.read`

### 2. 服务器准备

需要一台 Linux 服务器(推荐 Ubuntu 22+/24+):

- 安装 Docker 和 Docker Compose
- 安装 Caddy (做 HTTPS 反向代理)
- 公网可访问的域名 + 80/443 端口开放

### 3. 部署

```bash
# 克隆代码
git clone git@github.com:fitchsao/badminton.git
cd badminton

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 填入真实值(参考 .env.example 注释)
nano .env

# 启动
docker compose up -d

# 初始化数据库(首次)
docker compose exec backend npm run migrate

# 验证
curl https://你的域名/api/health
```

详细部署步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 开发

### 本地启动

```bash
# 后端
cd backend
npm install
npm run dev       # 开发模式 (tsx watch)

# 前端
cd frontend
npm install
npm run dev       # Vite dev server (端口 5173)
```

### 跑测试

```bash
cd e2e-tests
npm install
cp .env.example .env  # 填入 DEV_SECRET (服务器 .env 里的)
npm test              # 25 个 API 集成测试
```

## 找到群 chat_id

为了让机器人发到指定群:

1. 在 Lark 群内 @机器人 任意一条消息
2. 查看后端日志,会打印收到的事件,里面包含 `chat_id`
3. 复制 `oc_xxxxx` 这一串填到 `.env` 的 `LARK_TARGET_CHAT_ID`

## License

Internal use only - Klook
