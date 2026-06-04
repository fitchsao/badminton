# 部署指南

## 首次部署

### 1. 服务器准备

需求:
- Linux (Ubuntu 22+ / Debian 11+ 推荐)
- 2GB RAM, 20GB 磁盘
- 公网 IP + 域名(80/443 端口开放)
- Docker 24+ 和 Docker Compose v2+

安装 Docker:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录使生效
```

### 2. 拉取代码

```bash
sudo mkdir -p /opt/badminton
sudo chown $USER:$USER /opt/badminton
cd /opt/badminton

git clone git@github.com:fitchsao/badminton.git .
```

### 3. 配置环境变量

```bash
cp .env.example .env

# 生成必要的 secret
echo "COOKIE_HMAC_SECRET=$(openssl rand -hex 32)" >> .env
echo "ADMIN_TRIGGER_TOKEN=$(openssl rand -hex 24)" >> .env

# 编辑填入其他值(LARK_APP_ID 等)
nano .env
```

⚠️ **重要**: 生产环境 `DEV_SECRET` 必须设为空字符串 `""`,关闭调试端点。

### 4. 启动

```bash
docker compose up -d
docker compose logs -f backend  # 看启动日志
```

应该看到 "Server listening at http://0.0.0.0:3000"。

### 5. 数据库初始化

首次启动时,migrations 会自动跑(backend 启动时执行)。

如果想手动跑:
```bash
docker compose exec backend npm run migrate
```

### 6. Caddy 反向代理 + HTTPS

`/etc/caddy/Caddyfile`:
```
你的域名 {
    reverse_proxy /api/* localhost:3000
    reverse_proxy /auth/* localhost:3000
    reverse_proxy /admin/trigger-signup localhost:3000
    reverse_proxy /webhook/lark localhost:3000

    handle {
        reverse_proxy localhost:8080
    }
}
```

Caddy 会自动申请 Let's Encrypt 证书。

启动:
```bash
sudo systemctl restart caddy
```

## 更新部署

```bash
cd /opt/badminton
git pull
docker compose build
docker compose up -d
docker compose logs --tail=20 backend
```

## 仅更新前端(不需要重建)

```bash
cd /opt/badminton
git pull

# 重新构建 frontend 镜像并替换
docker compose build frontend
docker compose up -d frontend
```

## 仅更新后端

```bash
cd /opt/badminton
git pull

docker compose build backend
docker compose up -d backend
docker compose logs --tail=20 backend
```

## 数据库备份

```bash
# 备份到本地文件
docker compose exec -T db pg_dump -U badminton badminton > backup_$(date +%Y%m%d).sql

# 恢复
cat backup_xxx.sql | docker compose exec -T db psql -U badminton badminton
```

建议加 cron 每天自动备份:
```bash
# /etc/cron.d/badminton-backup
0 3 * * * admin cd /opt/badminton && docker compose exec -T db pg_dump -U badminton badminton | gzip > /var/backups/badminton/$(date +\%Y\%m\%d).sql.gz
```

## 运维常用命令

```bash
# 看容器状态
docker compose ps

# 看日志
docker compose logs -f backend
docker compose logs --tail=50 backend

# 重启某个服务
docker compose restart backend

# 进入容器调试
docker compose exec backend sh
docker compose exec db psql -U badminton badminton
```

## 故障排查

### Lark 登录失败
- 检查 `LARK_APP_ID` / `LARK_APP_SECRET` 是否最新
- 检查 Lark 后台「重定向 URL」是否包含 `https://你的域名/auth/callback`
- 看 backend 日志是否有 token 请求失败

### 机器人不发消息
- 检查 `LARK_TARGET_CHAT_ID` 是否正确
- 检查机器人是否在该群里
- 检查应用权限是否包含 `im:message`

### 502 Bad Gateway
- backend 没启动起来,看 docker compose logs backend
- 检查 8080 (frontend) 和 3000 (backend) 端口是否正常监听
