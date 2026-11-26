# vehicle-ops-dashboard · 车队实时监控看板

把「后台里翻五页才能看全的车况」做成一块随时能打开的网页。

13 辆车（或多到几十辆）的版本、状态、位置、在线情况，一屏看完；版本换了、掉线了，页面上直接能看出来。

技术栈很普通：Python 采集脚本 + Postgres + React。没有微服务，没有消息队列，一个人能维护。

---

## 它是怎么跑的

```
   车辆平台 / 任何数据源
          │  每 10 分钟抓一次
          ▼
   collector（Python）  ──写──▶  Postgres（快照表 + 变更流水）
                                        │
                                        │  REST / 实时推送
                                        ▼
                                  React 看板（只读）
```

为什么不干脆让网页直接请求平台接口：跨域、登录 Cookie 不跨站、每个访客都压一遍平台——三个坑，绕不过去。所以把「抓数据」和「看数据」拆开，中间放个数据库。

---

## 三种跑法，从最简单开始

### 跑法一：只看界面（不需要数据库，30 秒）

适合：想先看看长什么样、想改样式、没有数据库环境。

```bash
cd web
npm install
npm run dev          # 打开 http://localhost:5173
```

页面顶部会出现一个黄色的「演示数据」标记。数据来自 `web/public/demo/vehicle_status.json`，也就是**虚拟数据库**：两个 JSON 文件冒充数据库，前端照样跑完整流程。

它能做什么：看布局、试筛选、改配色、调交互。
它不能做什么：数据是死的，刷新不会变，也不能写入。

想换一批演示数据（比如换成 20 辆车）：

```bash
cd collector
python3 -m vehicle_ops --config config.example.json --export ../web/public/demo
```

这条命令会用内置的假数据源生成新的 JSON，写回 `web/public/demo/`。刷新页面就变了。

> 前端会把 JSON 里的时间整体平移到「刚刚」，所以你过几天再打开，也不会看到一堆「数据未更新」的警告。

### 跑法二：带一个真数据库（本地，5 分钟）

适合：想验证入库、变更记录、实时推送这些真实行为。

```bash
docker compose up -d            # 起 Postgres + PostgREST，自动建表

cd collector
cp config.example.json config.json
python3 -m vehicle_ops --config config.json      # 写 6 辆假车进库

cd ../web
cp .env.example .env.local
# 把 .env.local 里的 VITE_DEMO_MODE 改成 false
npm run dev
```

这时候页面右上角没有「演示数据」标记，数据是真的从数据库读出来的，采集脚本再跑一次，页面会自动更新。

### 跑法三：接自己的平台（生产）

改一个文件就行：在 `collector/vehicle_ops/providers/` 下新建 `your_platform.py`，实现 `fetch()`，返回统一的 `Vehicle` 列表。

```python
from ..models import Vehicle

class YourPlatformProvider:
    name = "your-platform"

    def __init__(self, config):
        self.config = config

    def fetch(self) -> list[Vehicle]:
        raw = your_http_call()          # 登录态、签名、SDK，随你怎么拿
        return [
            Vehicle(
                vin=item["vin"],
                name=item.get("name", ""),
                autocar_version=item.get("version", ""),
                status=item.get("status", ""),
                place=item.get("city", ""),
                heartbeat_at=item.get("last_seen"),
                raw=item,
            )
            for item in raw
        ]
```

然后在 `providers/__init__.py` 注册，配置里写 `"provider": "your-platform"`。

**存储层、前端、筛选逻辑都不用动。**

---

## 卡片上的三个按钮，可以自己配

每辆车卡片底部可以有三颗按钮：监控、任务、平台。地址来自环境变量，不配就不显示：

```bash
# web/.env.local
VITE_MONITOR_URL_TEMPLATE=https://your-platform.example.com/live?vin={vin}&t={heartbeat}
VITE_TASK_URL_TEMPLATE=https://your-platform.example.com/tasks?vin={vin}&from={dayStart}&to={dayEnd}
VITE_VEHICLE_SOURCE_URL=https://your-platform.example.com/vehicles
```

可用占位符：`{vin}` `{name}` `{plate}` `{alias}` `{heartbeat}` `{dayStart}` `{dayEnd}`。

`{heartbeat}` 是这辆车最近一次上报的时间，`{dayStart}` / `{dayEnd}` 是采集当天的 00:00:00 和 23:59:59。拼好的值会自动 URL 编码。

---

## 目录

```
vehicle-ops-dashboard/
├── supabase/migrations/        建表、权限、实时发布，全是可重复执行的 SQL
├── collector/                  采集与同步（Python 3.10+，零第三方依赖）
│   ├── config.example.json     车辆清单 + 数据源 + 数据库地址
│   ├── vehicle_ops/
│   │   ├── models.py           统一的 Vehicle 模型
│   │   ├── status.py           状态码翻译、班次判断、异常口径
│   │   ├── store.py            写库 + 算变更
│   │   ├── cli.py              命令行入口
│   │   └── providers/          mock（内置）+ 你自己的实现
│   └── tests/                  18 个单测，不连网
├── web/                        Vite + React + Tailwind
│   ├── public/demo/            虚拟数据库（演示模式读这两个 JSON）
│   └── src/{pages,components,hooks,lib}
├── docs/                       架构、数据口径、维护手册
└── docker-compose.yml          本地 Postgres + PostgREST
```

---

## 想改点什么，看这张表

| 你的需求 | 改哪个文件 |
| --- | --- |
| 加车 / 删车 | `collector/config.json` 的 `vehicles` |
| 换个平台 | 新建 `providers/xxx.py`，在 `providers/__init__.py` 注册 |
| 平台字段对不上 | `providers/xxx.py` 里的映射 |
| 多显示一个字段 | 建表 SQL 加列 → provider 填值 → `models.py` 加字段 → `VehicleCard.jsx` 渲染 |
| 状态文案不对 | `collector/vehicle_ops/status.py` 的 `STATUS_MAP` |
| 在线判定太严/太松 | `web/src/lib/vehicle-format.js` 的 `STALE_MINUTES` |
| 卡片按钮跳错地方 | `web/src/lib/external-links.js` 或 `.env.local` 的模板 |
| 筛选条件不够用 | `web/src/pages/Index.jsx` 的 `*Filter` 和 `visibleRows` |
| 配色不好看 | `tailwind.config.js` + `vehicle-format.js` 里的 `STATUS_STYLES` |

更细的版本在 [docs/maintenance.md](docs/maintenance.md)。

---

## 数据口径

| 字段 | 含义 | 注意 |
| --- | --- | --- |
| `autocar_version` | 车端固件版本 | 平台版本接口实时取 |
| `status` | 运行中 / 初始化失败 / 已收车…… | 平台状态码翻译；没有实时状态时按班次推算，带 `*` |
| `place` | 当前约车地点 | 取不到就回落到车辆归属地 |
| `heartbeat_at` | 最近一次上报时间 | 页面上的「在线 · 3 分钟前」就是它 |
| 在线判定 | **20 分钟内上报 = 在线** | 这个值必须比采集周期长，否则每次采集前会集体闪成「离线」 |
| `collected_at` | 本次采集时间 | 超过 20 分钟，卡片显示「数据未更新」，不冤枉车掉线 |

---

## 定时采集怎么配

采集脚本跑一次就退出，靠外部定时器叫醒它。三选一：

- **macOS**：launchd，`StartInterval` 填 600（秒），电脑合盖就停
- **Linux**：cron，`*/10 * * * *`
- **GitHub Actions**：需要 self-hosted runner，托管 runner 在公网，通常够不着内网平台

脚本失败会非 0 退出，定时器那头能看到；日志直接打在标准输出，重定向到文件即可。

---

## 部署时注意

- 前端 `npm run build` 之后是纯静态文件，扔到任意静态托管就行
- 数据库用 Supabase 最省事：自带 REST 接口、实时推送、行级权限
- 只把 `anon key` 放进前端，`service_role` 永远不进前端、不进仓库
- 演示项目里给 anon 开了写权限，方便采集脚本直连；**对着公网开放前，请改成服务端写入**
- 公网部署记得在前面加一层登录，别让车况数据裸奔

---

## 常见问题

**页面一直是「暂无采集数据」？**
先确认数据真的进库了：`curl localhost:54321/vehicle_status`。空的就说明采集没跑成功，看采集脚本的输出。

**采集跑完，页面没变化？**
页面 30 秒轮询一次；数据库连了实时推送的话是秒级。检查 `.env.local` 里的地址和 key 对不对。

**版本号显示「无记录」？**
这辆车在平台版本接口里查不到。先看平台页面上有没有，再检查 provider 里的车型字段。

**为什么不用前端直连平台？**
跨域、Cookie 不跨站、访客一多就是压测平台。抓数据这件事交给一台有登录态的机器更靠谱。

---

## 测试

```bash
cd collector && python3 -m unittest discover -s tests -t . -v
cd web && npm run build
```

CI 在 `.github/workflows/ci.yml`，推上去自动跑。

## License

MIT
