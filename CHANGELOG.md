# Changelog

## 1.3.0

- 全部换成通用命名：`autocar_version` → `firmware_version`，界面上写「固件版本」，代码里不再出现任何厂商专有名词
- 演示数据扩到 10 辆车，并附带 4 条变更记录，右栏「最近变化」不再是空的
- README 增加「下载下来就能跑」，明确虚拟数据库就是 `web/public/demo/` 下那两个 JSON

## 1.2.0

- 新增**演示模式**：不配数据库时自动读 `web/public/demo/*.json`，`npm install && npm run dev` 就能看到完整界面
- 新增 `python -m vehicle_ops --export <dir>`，用假数据源一键生成前端演示数据
- 卡片底部新增「监控 / 任务 / 平台」三个外链按钮，地址由 `VITE_MONITOR_URL_TEMPLATE`、`VITE_TASK_URL_TEMPLATE`、`VITE_VEHICLE_SOURCE_URL` 配置，不配则不显示
- README 重写，按「只看界面 / 带本地库 / 接自己平台」三种跑法组织

## 1.1.0

- 四层筛选：车型 / 状态 / **站点** / 单车号，每层带计数，支持组合与一键清空
- 在线判定改为 20 分钟窗口（大于采集周期，修掉「采集间隙集体闪离线」的问题）
- 采集数据过期时显示「数据未更新」，不再误报离线
- 卡片「在线状态」支持跳转源平台核对，悬停显示精确上报时间（需配置 `VITE_VEHICLE_SOURCE_URL`）
- 看板信息层级重做：KPI 带在线率进度条、右栏 sticky、卡片信息分层

## 1.0.0

- 采集器：`provider` 抽象 + 统一 `Vehicle` 模型，状态码翻译与班次判定收敛在 `status.py`
- 存储：`vehicle_status` 快照 + `vehicle_events` 变更流水，幂等 upsert，只记「新旧都非空且不同」的变化
- 看板：KPI、筛选搜索、车辆卡片、版本分布、最近变化、采集超时告警
- 18 个单测覆盖状态映射、班次判定、变更 diff、模型转换
- CI：采集器单测 + mock 冒烟 + 前端构建
