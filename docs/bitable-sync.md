# 飞书多维表格同步方案(#3)

> 决策:**镜像同步**模式 —— PostgreSQL 仍为唯一权威数据源(保证 20s 实时计分、段位 MMR 计算的性能);
> 数据**单向同步**到飞书多维表格,供在飞书内查看/轻量编辑(只读消费为主)。
> 不把多维表格当主库,以规避 Bitable 的 API 限流与延迟对实时写入路径的影响。

## 架构

```
写入路径(报名/计分/分组…) → Postgres(权威) ──┐
                                              ├─→ 同步队列 → 飞书多维表格(镜像)
后台 cron / 写后钩子 ─────────────────────────┘
```

- 主流程照常写 Postgres,**不被 Bitable 拖慢/阻塞**。
- 同步层异步把变更推到多维表格(失败重试,不影响主流程)。
- 推荐**全量定时同步 + 关键事件增量同步**结合:
  - 每分钟(或每次 session 状态切换)做一次"差异 upsert";
  - 报名/取消/计分等关键写操作后触发一次轻量增量。

## 多维表格结构(1 个 App,9 张表)

| 表(中文名) | 主要字段 | 同步来源 |
|---|---|---|
| 场次 Sessions | session_id、报名开/截、赛开/结、名额、状态 | sessions |
| 报名 Signups | session_id、openId、姓名、性别、偏好场地、是否候补、位次、报名时间 | signups |
| 场地 Courts | session_id、场地名、类型(对抗/竞技/休闲)、容量 | courts |
| 分组 Assignments | session_id、场地、openId、姓名、排序 | court_assignments |
| 对局 Matches | session_id、场地、轮次、A队、B队、比分A、比分B | matches |
| 用户 Users | openId、姓名、性别、历史偏好、MMR/段位(冗余便于看板) | user_prefs + 计算 |
| 订阅 Subscriptions | openId、姓名、目标(下周提醒) | subscriptions |
| 配置 Config | key、value(JSON:场地模板/时间表/admin/白名单/分数上限/场馆) | app_config |
| 审计 Audit | 时间、操作人、动作、对象 | admin_audit |

> 每张表用一个稳定业务键(如 `session_id`、`signup id`)作为 upsert 依据,避免重复。

## 已创建的多维表格(2026-06-17 via MCP)

- App:**客乐羽 · 数据镜像**
- `app_token` = `XOctbCAoQaSVNasuzQPlv7magiz`
- 链接:https://klook.sg.larksuite.com/base/XOctbCAoQaSVNasuzQPlv7magiz

| 表 | table_id |
|---|---|
| 场次 Sessions ✓ | `tblhRX49RSIaXE0R` |
| 报名 Signups | `tblSsYpeoZ9ixlaK` |
| 场地 Courts | `tblfE8XCUYT4GDuO` |
| 分组 Assignments | `tblEmsXltjpnA0VM` |
| 对局 Matches | `tblR4HRzIhWFgPOZ` |
| 用户 Users | `tblU8lqqMT1j30Xf` |
| 订阅 Subscriptions | `tbl6hzkjaX7URSST` |
| 配置 Config | `tblSxncB8zd77AFG` |
| 审计 Audit | `tblIQG9jfy7qSI19` |

> ⚠️ 还有两张**空表**需在 Bitable UI 手动删除:自动生成的默认表(`tblJPP9Qpkt9pqiw`)、以及一张误建的空「场次 Sessions」(`tbl7LdApETtrk33c`)。正式用的是带 ✓ 的那张。

`.env` 对应(建表已回填):
```
BITABLE_APP_TOKEN=XOctbCAoQaSVNasuzQPlv7magiz
BITABLE_TABLE_SESSIONS=tblhRX49RSIaXE0R
BITABLE_TABLE_SIGNUPS=tblSsYpeoZ9ixlaK
BITABLE_TABLE_COURTS=tblfE8XCUYT4GDuO
BITABLE_TABLE_ASSIGNMENTS=tblEmsXltjpnA0VM
BITABLE_TABLE_MATCHES=tblR4HRzIhWFgPOZ
BITABLE_TABLE_USERS=tblU8lqqMT1j30Xf
BITABLE_TABLE_SUBSCRIPTIONS=tbl6hzkjaX7URSST
BITABLE_TABLE_CONFIG=tblSxncB8zd77AFG
BITABLE_TABLE_AUDIT=tblIQG9jfy7qSI19
BITABLE_SYNC_ENABLED=1
```

> ⚠️ **访问权限关键点**:此 Base 由 MCP(某 Lark 应用)创建。后端用的是另一个 Lark 应用(`LARK_APP_ID`)。
> 后端要能写这张表,需把**后端应用**加为该 Base 的协作者(在 Base「⋯ → 添加文档应用/协作者」里添加后端机器人),否则即使有 `bitable:app` 权限也会 403。

## 落地步骤(待你提供凭据后由我实现)

1. 我用已连接的飞书 MCP **自动建好 App + 9 张表 + 字段**(或你给一个已建好的 App)。
2. 后端新增 `services/bitableSync.ts`:封装 Lark 多维表格 record 的 batch upsert;
   `index.ts` 启动时挂一个 cron(每分钟差异同步)+ 在关键写操作后触发增量。
3. 在 `.env` 增加:
   ```
   BITABLE_APP_TOKEN=...        # 多维表格 App token
   BITABLE_TABLE_SESSIONS=tbl... # 各表 table_id(建表后我回填)
   BITABLE_TABLE_SIGNUPS=tbl...
   ...
   BITABLE_SYNC_ENABLED=1
   ```

## 需要你提供 / 确认

1. **Lark 应用权限**:给现有 Lark 应用开通多维表格读写权限
   `bitable:app`(或更细:`base:record:write`、`base:table:read` 等),并发布生效。
2. **多维表格归属**:在哪个空间/文件夹放这个多维表格(给我一个可写位置,或我用 MCP 在你个人空间创建后把链接给你)。
3. **同步方向**:确认**单向(Postgres → 多维表格)**即可,还是也要"在多维表格里改、回写 Postgres"(双向会复杂很多、且有冲突问题,默认不做)。
4. **同步频率**:默认每分钟差异同步 + 关键事件增量,是否可接受。

确认 1–4 后,我建表 + 写同步层 + 回填 table_id + 部署联调。
