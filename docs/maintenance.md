# 维护手册：改什么需求，动哪个文件

所有路径相对仓库根目录。改完记得跑 `collector/tests` 和 `web` 的构建。

## 一、需求 → 改动点

| 需求 | 改哪里 | 注意 |
| --- | --- | --- |
| 加一辆车 / 删一辆车 | `collector/config.json` 的 `vehicles` | `name` 必须是平台真实车名（小写），`alias` 是你习惯的叫法；改完重启采集任务 |
| 改采集频率 | launchd/cron 的 `StartInterval`；前端 `web/src/hooks/useVehicleStatus.js` 的 `POLL_MS` | 频率别比平台限流更激进，10 分钟是实测安全值 |
| 卡片上多显示一个字段（如电量） | ① `migrations/0002_xxx.sql` 加列 ② `providers/*.py` 填值 ③ `models.py` 加字段 ④ `store.py` 的 `FIELD_SPECS` 需要记流水就加 ⑤ `VehicleCard.jsx` 渲染 | 五处缺一处就会「前端有列、库里没值」 |
| 少显示一个字段 | 只删 `VehicleCard.jsx` 里的 `MetaRow`，不要删库列 | 库列保留，历史数据还有用 |
| 改状态文案 | `collector/vehicle_ops/status.py` 的 `STATUS_MAP`；前端配色 `web/src/lib/vehicle-format.js` 的 `STATUS_STYLES` | 出现新状态码时先在这里加映射，否则页面会直接显示英文码 |
| 改「异常」口径 | `status.is_abnormal()`（Python）+ `isAbnormal()`（JS） | 两边必须同步，否则 KPI 和卡片红边会对不上 |
| 改在线判定窗口 | `web/src/lib/vehicle-format.js` 的 `STALE_MINUTES`（默认 20 分钟） | 必须大于采集周期，否则每次采集前会集体闪成「离线」 |
| 改卡片按钮跳转 | `web/src/lib/external-links.js` 或 `.env.local` 里的三个 URL 模板 | 占位符 `{vin} {name} {plate} {heartbeat} {dayStart} {dayEnd}` |
| 换演示数据 | `web/public/demo/*.json`，用 `python -m vehicle_ops --export ../web/public/demo` 重新生成 | 演示模式只在没配数据库时生效 |
| 加/改筛选维度 | `web/src/pages/Index.jsx` 的 `*Filter` 状态 + `visibleRows` | 站点筛选用的是 `place` 字段，口径变了要同步 |
| 改卡片按钮跳转 | `web/src/lib/external-links.js` 的模板，或 `.env.local` 的 `VITE_MONITOR_URL_TEMPLATE` / `VITE_TASK_URL_TEMPLATE` / `VITE_VEHICLE_SOURCE_URL` | 占位符 `{vin} {name} {plate} {heartbeat} {dayStart} {dayEnd}`，不配就不显示按钮 |
| 换数据源 | 新建 `collector/vehicle_ops/providers/xxx.py`，实现 `fetch() -> list[Vehicle]`；`providers/__init__.py` 注册；配置里 `provider: xxx` | 存储层和前端完全不用动，这是分层的意义 |
| 改表结构 | 新增 `supabase/migrations/000N_xxx.sql` | 不要改 0001，已上线库不会重跑；用新文件做增量 |
| 改权限（谁能看） | 数据库看 `migrations` 里的 RLS 策略；站点看托管平台的访问控制 | 公网场景请把写权限收回服务端 |
| 改主题/配色 | `web/src/index.css` 的 CSS 变量 + `tailwind.config.js` | 卡片里的语义色在 `vehicle-format.js` 的 `STATUS_STYLES` |

## 二、日常排查

页面出问题时按这个顺序看，通常三步内定位：

1. **库里有没有数据**
   ```bash
   curl -s "$SUPABASE_URL/rest/v1/vehicle_status?select=alias,collected_at" -H "apikey: $ANON_KEY"
   ```
   有数据但很旧 → 采集停了；没数据 → 采集从没跑通。

2. **采集是不是在跑**
   ```bash
   # macOS
   launchctl list | grep vehicle
   tail -f collector/vehicle_sync.log
   ```
   日志里出现 `同步失败` → 看下一行的异常信息；出现 `未采集到: xxx` → 该车在平台改名或下线了。

3. **采集出来的值对不对**
   ```bash
   python3 -m vehicle_ops --config config.json --dry-run
   ```
   和平台页面逐项比对。`--dry-run` 不写库，可以放心反复跑。

## 三、常见故障对照表

| 现象 | 最可能的原因 | 处理 |
| --- | --- | --- |
| 页面白屏 / 控制台报 `VITE_SUPABASE_URL` | 没建 `.env.local` | 复制 `.env.example` 后重跑 `npm run dev` |
| 页面一直「暂无采集数据」 | 采集没跑过，或 anon key 无写权限 | 先 `--dry-run` 确认采集，再查 RLS 与 grant |
| 顶部出现「演示数据」标记 | `.env.local` 里没配 `VITE_SUPABASE_URL`，或 `VITE_DEMO_MODE=true` | 要连真库就把 `VITE_DEMO_MODE` 改 false 并填地址 |
| 数据一直不更新，页面黄条告警 | 采集机器休眠 / 任务未加载 | `launchctl list`、先手动跑一次看日志 |
| 在线状态时间显示「-」 | 时间格式不认识 | `providers/*.py` 的 `to_iso()` 支持 `YYYY/MM/DD HH:MM:SS`，新格式要补 |
| 「最近变化」刷屏 | 新旧值没有归一（原始码 vs 中文） | 在 `status.py` 补映射，`build_events` 会自动归一后再比 |
| 状态一直「排班中*」 | 运营车不在路测监控里，只能按班次推算 | 属预期；要真实状态需接入该车的实时状态源 |
| 卡片版本号被截断 | 版本字符串很长 | 已用 `line-clamp-2 + break-all`，必要时改 `VehicleCard.jsx` 字号 |

## 四、发布流程

```bash
# 1. 改代码
# 2. 单测 + 构建
cd collector && python3 -m unittest discover -s tests -t . -v && cd ..
cd web && npm run build && cd ..
# 3. 提交
git add -A && git commit -m "feat: xxx"
```

数据库变更独立走 migration 文件，和代码一起提交，评审时能一眼看到 DDL。
