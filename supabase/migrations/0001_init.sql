-- 0001_init.sql —— 车辆实时看板的全部存储结构
-- 适用：Supabase / 原生 Postgres（PostgREST 暴露 public schema）
-- 幂等：可重复执行

-- ---------------------------------------------------------------- 快照表
-- 一辆车一行，采集任务 upsert；页面只读这张表
create table if not exists public.vehicle_status (
  vin              text primary key,
  alias            text default '',
  name             text default '',
  vehicle_type     text default '',
  plate            text default '',
  autocar_version  text default '',
  overall_version  text default '',
  status           text default '',
  place            text default '',
  purpose          text default '',
  slot             text default '',
  heartbeat_at     timestamptz,
  collected_at     timestamptz default now(),
  payload          jsonb default '{}'::jsonb
);

comment on table  public.vehicle_status is '车辆最新状态快照，一辆车一行';
comment on column public.vehicle_status.payload is '采集到的原始 JSON，新增字段不用改表';

-- ---------------------------------------------------------------- 事件表
-- 只追加：版本 / 状态 / 约车地点发生变化时写一条，用于「最近变化」和回溯
create table if not exists public.vehicle_events (
  id          bigint generated always as identity primary key,
  vin         text not null,
  alias       text default '',
  kind        text not null,           -- version | status | place
  field       text not null,           -- 展示用字段名
  old_value   text default '',
  new_value   text default '',
  created_at  timestamptz default now()
);

create index if not exists vehicle_events_created_at_idx
  on public.vehicle_events (created_at desc);

comment on table public.vehicle_events is '字段变更流水，append-only';

-- ---------------------------------------------------------------- 权限
alter table public.vehicle_status enable row level security;
alter table public.vehicle_events enable row level security;

drop policy if exists vehicle_status_read on public.vehicle_status;
create policy vehicle_status_read on public.vehicle_status
  for select to anon, authenticated using (true);

-- 写权限给 anon：演示项目默认让采集脚本用 anon key 直连；anon key 本身会打进前端包
-- 若部署到公网，请改成 service_role 直连或自建后端，不要给 anon 开写权限
drop policy if exists vehicle_status_write on public.vehicle_status;
create policy vehicle_status_write on public.vehicle_status
  for all to anon, authenticated using (true) with check (true);

drop policy if exists vehicle_events_read on public.vehicle_events;
create policy vehicle_events_read on public.vehicle_events
  for select to anon, authenticated using (true);

drop policy if exists vehicle_events_write on public.vehicle_events;
create policy vehicle_events_write on public.vehicle_events
  for insert to anon, authenticated with check (true);

grant select, insert, update, delete on public.vehicle_status to anon, authenticated;
grant select, insert on public.vehicle_events to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ---------------------------------------------------------------- 实时推送
-- 前端用 supabase.channel().on('postgres_changes') 订阅；没有这段就退化成轮询
alter table public.vehicle_status replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime for table public.vehicle_status;
  elsif not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'vehicle_status'
  ) then
    alter publication supabase_realtime add table public.vehicle_status;
  end if;
end $$;
