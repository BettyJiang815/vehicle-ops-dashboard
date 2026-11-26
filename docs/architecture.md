# 架构说明

## 1. 为什么是三层，而不是「前端直接调平台接口」

最直觉的做法是让网页自己去请求车辆平台。这条路在实践中走不通，原因有三个：

1. **跨域**：平台接口不会给任意域名发 `Access-Control-Allow-Origin`
2. **登录态**：接口依赖 SSO cookie，浏览器把跨站请求视作第三方请求，cookie 不发送
3. **限流与稳定性**：每个打开页面的人都在打平台接口，人一多就是压测

所以拆成三层，各管一件事：

| 层 | 职责 | 挂了会怎样 |
| --- | --- | --- |
| 采集层（collector） | 用有登录态的机器抓数据、归一、写库 | 页面数据不更新，但历史与新打开的页面仍可用 |
| 存储层（Postgres） | 快照 + 事件流水 | 采集会失败告警，前端报错；不丢历史 |
| 展示层（React） | 只读数据库、渲染 | 采集照常写库，恢复后补齐 |

## 2. 采集层

```
provider.fetch() ──▶ list[Vehicle] ──▶ to_record() ──▶ SupabaseStore.upsert()
                                              └─────▶ build_events() ──▶ insert
```

- **provider**：唯一和数据源耦合的地方。`your_platform.py` 负责登录态与字段映射，`mock.py` 生成稳定假数据。
- **归一**：所有平台字段在 `providers/*.py` 里映射成 `Vehicle`；状态码翻译集中在 `status.py`，下游只看到中文。
- **幂等**：以 `vin` 为主键 upsert，跑 1 次和跑 100 次结果一样。
- **只记真变化**：`build_events` 比较旧快照与新记录，且要求「新旧都非空」，避免偶发缺字段写出一条假变更。

一次采集的耗时主要花在平台接口上（多车型分页查询 + 约车任务页），典型 1–3 分钟。这也是采集间隔不能太短的现实原因。

## 3. 存储层

两张表分工明确：

- `vehicle_status`：一辆车一行，**只保留当前值**。前端一次 `select *` 就能渲染整屏，13 辆车约 4KB。
- `vehicle_events`：append-only 变更流水。用于「最近变化」与回溯，不带索引压力（只按 `created_at desc` 查 30 条）。

为什么不只留事件表？每次渲染都要把每个 VIN 的全量事件重放一遍才能算出当前状态，13 辆车就有 13 次窗口查询——把复杂度放在写侧（一次较慢的采集）比放在读侧（谁打开页面都要算）划算。

RLS 的策略是「读全开、写给 anon」：这是演示项目的取舍，anon key 本来就随前端包公开，安全性靠部署边界的登录网关承担。公网部署时必须换成服务端写入。

## 4. 展示层

```
useVehicleStatus()
  ├─ 进入页面 load()        ← 首屏不等 Realtime
  ├─ setInterval(30s)       ← 兜底轮询
  └─ channel(postgres_changes) ← 采集写入后立即刷新
        ↓
   rows / events (state)
        ↓ useMemo 派生
   onlineCount / abnormalCount / versionGroups / visibleRows
        ↓
   <Index> → <VehicleCard> × N
```

- 没有 Redux/Zustand：13 条数据 + 2 个筛选条件，`useState` 足够；引入全局状态反而增加心智负担。
- 派生数据全部 `useMemo`，筛选/搜索时不做二次请求。
- Realtime 是「加速器」不是「必需品」：订阅失败时轮询仍在，页面最多晚 30 秒。

## 5. 失败模式

| 失败 | 表现 | 恢复 |
| --- | --- | --- |
| 平台接口改字段 | 采集报 KeyError / 字段为空 | 改 `providers/your_platform.py` 映射 |
| 登录态过期 | 采集报 401/跳登录页 | 在采集机器上重新登录 |
| 采集机器休眠 | `collected_at` 停住 | 唤醒后下一次任务自动补齐 |
| 数据库连接失败 | 采集日志 `同步失败` | 检查网络/密钥；数据不丢，重跑即可 |
| Realtime 断开 | 页面仍 30 秒刷新 | 自动重连 |
