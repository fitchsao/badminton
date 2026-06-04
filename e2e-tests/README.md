# 羽毛球应用 E2E 测试

通过后端 API 验证关键 user case。本地 Mac 上跑,几秒内完成。

## 准备工作(只做一次)

### 1. 服务器加 `DEV_SECRET`

测试需要通过 `/api/dev/*` 端点重置数据 + 伪登录,这些端点**只有当 `DEV_SECRET` env 设置时才启用**。

在服务器上:
```bash
# 生成一个随机 secret
echo "DEV_SECRET=$(openssl rand -hex 16)" | sudo tee -a /opt/badminton/.env
# 重启 backend
cd /opt/badminton && sudo docker compose up -d backend
# 看日志确认启动:
sudo docker compose logs --tail=5 backend
# 应看到: ⚠️  DEV_SECRET 已设置 → 启用 /api/dev/* 端点
```

记下你生成的 secret 值。

### 2. 本地 Mac 装依赖

```bash
cd e2e-tests
npm install
```

### 3. 复制配置文件

```bash
cp .env.example .env
# 编辑 .env, 填入:
#   BASE_URL=https://klookbadminton.duckdns.org
#   DEV_SECRET=<你刚才生成的 secret>
```

## 运行

```bash
npm test
```

期望输出类似:
```
 ✓ tests/00_setup.test.ts (3)
 ✓ tests/01_signup.test.ts (4)
 ✓ tests/02_waitlist.test.ts (2)
 ✓ tests/03_score.test.ts (4)
 ✓ tests/04_rating.test.ts (4)
 ✓ tests/05_subscription.test.ts (4)
 ✓ tests/06_admin.test.ts (4)

 Test Files  7 passed (7)
      Tests  25 passed (25)
```

总耗时 10-30 秒。

## 测试覆盖

| 用例 | 验证什么 |
|---|---|
| 00. setup | dev 端点可达、reset 工作正常 |
| 01. 报名 | 新用户报名、取消、重新报名、防止重复报名 |
| 02. 候补晋升 | 填满后入候补 → 有人取消则第一位候补晋升 |
| 03. 比分 | 填分 / 改分 / Session 排行榜排序 / Court 排行榜 |
| 04. 段位 | 有历史的人有段位、无历史的「待定」、个人战绩结构 |
| 05. 订阅 | 订阅 / 取消 / 幂等 |
| 06. Admin | 非 admin 403、改 score_cap、非法值拒绝 |

## 故障排查

**所有用例都 fail**:
- `.env` 没创建,或 `DEV_SECRET` 填错
- 服务器没设 `DEV_SECRET`(看 backend 日志)
- 服务器没部署 v3.3+(没有 dev 端点)

**部分 fail**:
- mock 数据不一致:测试每个 file beforeAll 会 reset,如果某些 fail 后续会重置回干净状态。重跑一次。

**`DEV_SECRET 未设置 — 请创建 .env`**:
- 在 e2e-tests/ 目录下,而不是父目录创建 .env

## 数据安全

- 测试只操作 `mock_user_*` 和 `test_user_*` 前缀的 fake 用户(不影响真用户)
- `dev/reset` 会清理 mock 数据但**不动你已有的真实数据**
- 用 `Fitch` 这个真实 admin 时,只读不写

## 添加新测试

新文件命名 `NN_xxx.test.ts`,放在 `tests/`。所有测试自动被发现。

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { ApiClient, resetMockData, FITCH } from "./helpers/api.js";

describe("我的新用例", () => {
  beforeAll(async () => { await resetMockData(); });
  it("xxx", async () => { ... });
});
```
