# vehicle-ops-dashboard · 车队实时监控看板

> 把「平台后台 + 一堆表格」变成一块随时能看的实时看板。
> 采集 → 快照/流水 → 只读前端，三层解耦，换数据源只改一层。
>
> **A pluggable fleet monitoring dashboard** — collector → Postgres → React. Swap the data source by implementing one `fetch()` method.

---

## 1. 它解决什么问题

车队管理后台通常有三个麻烦：

1. **数据在页面里，不在接口里**：很多内部平台只有 UI，接口要登录态（Cookie / SSO），脚本拿不到数据；
2. **关注点分散**：版本在一个页面、在线状态在另一个、位置在第三个，没人愿意每天点五遍；
3. **没人帮你盯着**：车掉线了、版本被换回去了，往往事后才知道。

这个项目把三件事拆开：

- **采集层**：跑在「有登录态的那台机器」上，把平台数据抓出来、归一化、写库
- **存储层**：一张快照表（当前状态）+ 一张事件流水表（变更历史）
- **展示层**：纯静态前端，只读数据库，不碰平台接口

任何一层挂了，另外两层还能工作；换平台只改采集层的 provider。

## 2. 特性

- 任意 N 辆车的**固件版本 / 运行状态 / 约车地点 / 在线状态**，一屏看完
- **四层筛选**：车型 / 状态（在线·离线·异常）/ 站点 / 单车号，每层带实时计数，可组合
- 版本、状态、地点变更自动记流水，右栏「最近变化」直接看
- 页面 30 秒轮询 + Supabase Realtime 行变更推送，双保险
- **采集停摆会告警**：顶部黄条提示「已 X 分钟未更新」，不会拿过期数据当最新
- 卡片可跳转源平台核对（配置了 `VITE_VEHICLE_SOURCE_URL` 才显示），点击自动复制车号
- 采集器**零第三方依赖**（Python 标准库），内置 `mock` 数据源，离线即可跑通全链路

## 3. 架构

```
┌──────────────┐   带登录态的机器    ┌────────────┐   upsert/insert   ┌──────────────────┐
│ 车辆平台      │ ─────────────────▶ │ collector  │ ────────────────▶ │ Postgres         │
│ (任意数据源)  │   每 N 分钟         │ provider   │                   │ status / events  │
└──────────────┘                     └────────────┘                   └────────┬─────────┘
                                                                              │ REST + Realtime
                                                                      ┌───────▼────────┐
                                                                      │ React 看板      │
                                                                      └────────────────┘
```

为什么不让前端直接调平台接口：跨域、第三方 Cookie 被浏览器拦截、每个访客都压一遍平台接口——三条都走不通。

## 4. 快速开始（不接真实数据，5 分钟）

```bash
git clone <your-repo> && cd vehicle-ops-dashboard

# ① 起本地数据库（Postgres + PostgREST，自动执行 migrations）
docker compose up -d

# ② 灌一批演示数据（mock provider）
cd collector
cp config.example.json config.json
python3 -m vehicle_ops --config config.json
cd ..

# ③ 起前端
cd web
cp .env.example .env.local
npm install && npm run dev          # http://localhost:5173
```

没有数据时先 `curl localhost:54321/vehicle_status`，确认第 ② 步写进去了。

## 5. 接入你自己的数据源

只需实现一个协议：

```python
# collector/vehicle_ops/providers/your_platform.py
from ..models import Vehicle

class YourPlatformProvider:
    name = "your-platform"

    def __init__(self, config):
        self.config = config

    def fetch(self) -> list[Vehicle]:
        raw = your_http_call()          # 登录态、签名、SDK 随便你怎么拿
        return [
            Vehicle(
                vin=item["vin"],
                alias=item.get("alias", ""),
                autocar_version=item.get("version", ""),
                status=item.get("status", ""),
                place=item.get("city", ""),
                heartbeat_at=item.get("last_seen"),
                raw=item,
            )
            for item in raw
        ]
```

然后在 `providers/__init__.py` 注册，配置里写 `"provider": "your-platform"`。**存储层和前端一行都不用改。**

## 6. 目录结构

```
vehicle-ops-dashboard/
├── supabase/migrations/        # 建表 + RLS + 实时发布，全部 SQL，可重复执行
├── collector/                  # 采集与同步（Python 3.10+，零依赖）
│   ├── config.example.json     # 车辆清单 + 数据源 + 数据库连接
│   ├── vehicle_ops/
│   │   ├── models.py           # Vehicle 统一模型（provider 契约）
│   │   ├── status.py           # 状态码翻译 / 班次判定 / 异常口径
│   │   ├── store.py            # PostgREST upsert + 变更 diff
│   │   ├── cli.py              # python -m vehicle_ops
│   │   └── providers/          # base / mock / 你的实现
│   └── tests/                  # 18 个单测，不碰网络
├── web/                        # Vite + React + Tailwind
│   └── src/{pages,components,hooks,lib}
├── docs/                       # 架构、数据口径、维护手册
├── docker-compose.yml          # 本地 Postgres + PostgREST
└── .github/workflows/ci.yml    # 单测 + 构建
```

## 7. 核心代码地图

| 文件 | 职责 | 什么时候改 |
| --- | --- | --- |
| `collector/.../providers/*.py` | 平台字段 → 统一模型 | 换平台、平台加字段 |
| `collector/.../status.py` | 状态码 → 中文、班次判定、异常口径 | 出现新状态码、改「异常」定义 |
| `collector/.../store.py` | upsert 与事件 diff（`FIELD_SPECS`） | 想多监控一个字段 |
| `collector/config.example.json` | 车辆清单、数据源 | 加车/删车 |
| `supabase/migrations/*.sql` | 表结构、权限、实时发布 | 加列、加表、改权限 |
| `web/src/hooks/useVehicleStatus.js` | 取数 + 轮询 + 实时订阅 | 改刷新频率 |
| `web/src/components/VehicleCard.jsx` | 单车卡片 | 加字段、调样式、改跳转 |
| `web/src/pages/Index.jsx` | KPI / 四层筛选 / 布局 | 改看板结构 |
| `web/src/lib/vehicle-format.js` | 时间、配色、在线判定窗口 | 改文案与配色 |

更细的「什么需求动哪个文件」见 [docs/maintenance.md](docs/maintenance.md)。

## 8. 数据口径

| 字段 | 含义 | 说明 |
| --- | --- | --- |
| `autocar_version` | 车端固件版本 | 平台实时版本接口 |
| `status` | 运行中 / 初始化失败 / 已收车 … | 平台状态码翻译；无实时状态时按班次推算，文案带 `*` |
| `place` | 当前约车地点 | 约车任务城市，缺省回落到车辆归属场地 |
| `heartbeat_at` | 最近一次上报时间 | 页面上的「在线状态」就是它 |
| **在线判定** | **20 分钟内有上报 = 在线** | 必须大于采集周期，否则每次采集前会集体闪成离线 |
| `collected_at` | 本次采集时间 | 超过 20 分钟前端显示「数据未更新」，不误报离线 |

## 9. 采集调度

| 方式 | 适合 | 说明 |
| --- | --- | --- |
| macOS launchd | 个人电脑常开 | `StartInterval` 秒级可控，合盖即停 |
| cron / systemd timer | 常驻 Linux | `*/10 * * * *` |
| GitHub Actions | 有 self-hosted runner | 托管 runner 在公网，通常访问不到内网平台 |

launchd 片段：

```xml
<key>ProgramArguments</key>
<array>
  <string>/usr/bin/python3</string>
  <string>/path/to/collector</string>
</array>
<key>WorkingDirectory</key><string>/path/to/collector</string>
<key>StartInterval</key><integer>600</integer>
```

## 10. 部署

前端 `npm run build` 后把 `web/dist` 丢到任意静态托管；数据库用 Supabase（自带 REST + Realtime + RLS）最省事。

- **只暴露 anon key**：它本来就会打进前端包，靠 RLS 控制能读什么；`service_role` key 永不进前端、永不进仓库
- **写权限**：演示项目给 anon 开了写权限方便采集脚本直连；对公网开放前请改成服务端写入
- **鉴权**：公网部署请前置登录（网关 / SSO / 反向代理 basic auth），别让看板裸奔

## 11. 测试与开发

```bash
cd collector && python3 -m unittest discover -s tests -t . -v
cd web && npm run build
```

CI 见 `.github/workflows/ci.yml`。

## 12. 路线图

- [ ] 表格视图（一行一车，横向对比）
- [ ] 告警：离线超时 / 版本不符，推送到 IM
- [ ] 历史趋势：在线率、版本分布随时间变化

## License

MIT
