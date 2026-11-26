# 数据模型与常用查询

## 表结构

### vehicle_status（快照，一车一行）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `vin` | text PK | 业务主键。没有 VIN 的车用平台车名大写兜底 |
| `alias` | text | 展示用车号（如 `H24-120`） |
| `name` | text | 平台真实车名（如 `demo-001`） |
| `vehicle_type` | text | 车型，用于按车型批量查版本 |
| `plate` | text | 车牌 |
| `autocar_version` | text | 车端 Autocar 版本 |
| `overall_version` | text | 整车版本 |
| `status` | text | 中文状态标签（`运行中` / `初始化失败` / `排班中*` …） |
| `place` | text | 当前约车地点 |
| `purpose` | text | 约车目的 |
| `slot` | text | 今日班次，如 `08:00-18:00` |
| `heartbeat_at` | timestamptz | 最近一次上报时间 |
| `collected_at` | timestamptz | 本次采集时间 |
| `payload` | jsonb | 原始 JSON，加字段不用改表 |

### vehicle_events（变更流水，append-only）

| 列 | 说明 |
| --- | --- |
| `kind` | `version` / `status` / `place` |
| `field` | 展示名，如 `Autocar 版本` |
| `old_value` / `new_value` | 变化前后（状态已归一成中文） |
| `created_at` | 发生时间 |

## 常用查询

```sql
-- 当前全量
select alias, autocar_version, status, place, heartbeat_at
from vehicle_status order by alias;

-- 今天有哪些异常
select alias, autocar_version, status from vehicle_status
where autocar_version = '' or status in ('初始化失败', '平台无此车');

-- 版本分布
select autocar_version, count(*) from vehicle_status group by 1 order by 2 desc;

-- 超过 30 分钟没有上报的车
select alias, heartbeat_at, now() - heartbeat_at as gap
from vehicle_status
where heartbeat_at < now() - interval '30 minutes'
order by gap desc;

-- 最近 24 小时的版本变更
select alias, old_value, new_value, created_at
from vehicle_events
where kind = 'version' and created_at > now() - interval '24 hours'
order by created_at desc;
```

## 保留策略

`vehicle_events` 只增不改。按每天几十条的量级，一年不到 1 万行，可以长期保留；如果要清理，按月删除即可：

```sql
delete from vehicle_events where created_at < now() - interval '180 days';
```

`vehicle_status` 永远只有 N 行，不需要清理。

## 加字段的完整流程

以「电量」为例：

```sql
-- supabase/migrations/0002_battery.sql
alter table public.vehicle_status add column if not exists battery int;
```

```python
# providers/your_platform.py —— 填值
battery=int(row.get("battery") or 0),
```

```python
# models.py —— 加字段；store.FIELD_SPECS 需要记流水就加一项
battery: int = 0
```

```jsx
// VehicleCard.jsx —— 渲染
<MetaRow icon={Battery} label="电量" value={`${row.battery}%`} />
```

四步都做完再提交，缺一步就会出现「前端有、库里空」或「库里有、前端不显示」。
