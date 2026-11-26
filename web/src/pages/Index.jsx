import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Gauge,
  MapPin,
  RefreshCw,
  Search,
  Timer,
  Truck,
  X,
} from "lucide-react";
import VehicleCard from "@/components/VehicleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVehicleStatus } from "@/hooks/useVehicleStatus";
import { cn } from "@/lib/utils";
import { fmtAgo, fmtClock, isAbnormal, isOnline, prettyStatus, STALE_DATA_MINUTES } from "@/lib/vehicle-format";

const STATUS_FILTERS = [
  { id: "all", label: "全部" },
  { id: "online", label: "在线" },
  { id: "offline", label: "离线" },
  { id: "abnormal", label: "异常" },
];

const KPI = ({ icon: Icon, label, value, suffix, hint, tone = "default", ratio }) => {
  const tones = {
    default: "bg-slate-100 text-slate-600",
    success: "bg-emerald-50 text-emerald-600",
    danger: "bg-rose-50 text-rose-600",
  };
  const bars = {
    default: "bg-slate-400",
    success: "bg-emerald-500",
    danger: "bg-rose-500",
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
            {suffix ? <span className="ml-1 text-sm font-normal text-slate-400">{suffix}</span> : null}
          </p>
        </div>
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {typeof ratio === "number" ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn("h-full rounded-full transition-all", bars[tone])}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-[10px] text-slate-400">{hint}</p>
    </div>
  );
};

const Index = () => {
  const { rows, events, loading, error, lastSyncedAt, demo, refresh } = useVehicleStatus();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [carFilter, setCarFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 30));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const onlineCount = useMemo(() => rows.filter(isOnline).length, [rows]);
  const abnormalCount = useMemo(() => rows.filter(isAbnormal).length, [rows]);
  const offlineCount = rows.length - onlineCount;

  const types = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const key = (row.vehicle_type || "其他").toUpperCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const sites = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const key = (row.place || "未知").trim();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const versionGroups = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const key = row.autocar_version || "无记录";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const changedMap = useMemo(() => {
    const map = {};
    events
      .filter((event) => event.kind === "version")
      .forEach((event) => {
        const stamp = new Date(event.created_at).getTime();
        if (!map[event.vin] || stamp > map[event.vin]) map[event.vin] = stamp;
      });
    return map;
  }, [events]);

  const visibleRows = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (carFilter !== "all" && row.vin !== carFilter) return false;
      if (siteFilter !== "all" && (row.place || "未知").trim() !== siteFilter) return false;
      if (typeFilter !== "all" && (row.vehicle_type || "其他").toUpperCase() !== typeFilter) return false;
      if (statusFilter === "online" && !isOnline(row)) return false;
      if (statusFilter === "offline" && isOnline(row)) return false;
      if (statusFilter === "abnormal" && !isAbnormal(row)) return false;
      if (!text) return true;
      return [row.alias, row.name, row.place, row.autocar_version, row.plate]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(text));
    });
  }, [rows, carFilter, siteFilter, typeFilter, statusFilter, keyword]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setCountdown(30);
    setRefreshing(false);
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setTypeFilter("all");
    setSiteFilter("all");
    setCarFilter("all");
    setKeyword("");
  };

  const staleMinutes = lastSyncedAt
    ? (Date.now() - new Date(lastSyncedAt).getTime()) / 60000
    : null;
  const hasFilter =
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    siteFilter !== "all" ||
    carFilter !== "all" ||
    keyword.trim() !== "";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
              <Truck className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">
                运营车辆监控
              </h1>
              <p className="text-[11px] text-slate-400">
                Autocar 版本 · 运行状态 · 约车地点 · 在线状态
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {demo ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                演示数据
              </span>
            ) : null}
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500 sm:inline-flex">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  staleMinutes !== null && staleMinutes > STALE_DATA_MINUTES ? "bg-amber-500" : "bg-emerald-500",
                )}
              />
              数据更新：{lastSyncedAt ? fmtAgo(lastSyncedAt) : "-"}
            </span>
            <span className="hidden text-[10px] text-slate-400 md:inline">{countdown}s 后刷新</span>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")} />
              刷新
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            数据读取失败：{error}
          </div>
        ) : null}

        {staleMinutes !== null && staleMinutes > STALE_DATA_MINUTES ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <Timer className="h-4 w-4" />
            采集任务已 {Math.round(staleMinutes)} 分钟未更新，看看电脑是否休眠或后台任务是否在跑。
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPI icon={Truck} label="监控车辆" value={rows.length} suffix="辆" hint="来自车辆清单" />
          <KPI
            icon={Activity}
            label="在线车辆"
            value={onlineCount}
            suffix={`/ ${rows.length}`}
            hint="20 分钟内有上报"
            tone="success"
            ratio={rows.length ? onlineCount / rows.length : 0}
          />
          <KPI
            icon={AlertTriangle}
            label="异常车辆"
            value={abnormalCount}
            suffix="辆"
            hint="无版本 / 初始化失败"
            tone={abnormalCount ? "danger" : "default"}
          />
          <KPI icon={Gauge} label="在用版本" value={versionGroups.length} suffix="个" hint="不同 Autocar 版本" />
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100/70 p-0.5">
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                  typeFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                全部车型
              </button>
              {types.map(([type, count]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                    typeFilter === type ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {type}
                  <span className="ml-1 text-slate-400">{count}</span>
                </button>
              ))}
            </div>

            <div className="relative ml-auto w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜车号 / 地点 / 版本"
                className="h-8 border-slate-200 bg-slate-50/60 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="mr-1 text-[11px] text-slate-400">状态</span>
            {STATUS_FILTERS.map((item) => {
              const count =
                item.id === "online"
                  ? onlineCount
                  : item.id === "offline"
                    ? offlineCount
                    : item.id === "abnormal"
                      ? abnormalCount
                      : rows.length;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStatusFilter(item.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    statusFilter === item.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      "text-[10px]",
                      statusFilter === item.id ? "text-white/60" : "text-slate-400",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">按站点筛选</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSiteFilter("all")}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  siteFilter === "all"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                全部站点 {rows.length}
              </button>
              {sites.map(([site, count]) => (
                <button
                  key={site}
                  type="button"
                  onClick={() => setSiteFilter(siteFilter === site ? "all" : site)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    siteFilter === site
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  <MapPin className={cn("h-3 w-3", siteFilter === site ? "text-white/70" : "text-slate-400")} />
                  {site}
                  <span className={cn("text-[10px]", siteFilter === site ? "text-white/60" : "text-slate-400")}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">按车辆筛选</span>
              {hasFilter ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-slate-700"
                >
                  <X className="h-3 w-3" />
                  清空筛选
                </button>
              ) : null}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCarFilter("all")}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  carFilter === "all"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                全部车辆
              </button>
              {rows.map((row) => (
                <button
                  key={row.vin}
                  type="button"
                  onClick={() => setCarFilter(carFilter === row.vin ? "all" : row.vin)}
                  title={`${row.alias} · ${row.status}`}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    carFilter === row.vin
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isAbnormal(row)
                        ? "bg-rose-500"
                        : isOnline(row)
                          ? "bg-emerald-500"
                          : "bg-slate-300",
                    )}
                  />
                  {row.alias || row.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section>
            {loading && rows.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-56 animate-pulse rounded-xl border border-slate-200/80 bg-white"
                  />
                ))}
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                <Timer className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-600">
                  {rows.length === 0 ? "暂无采集数据" : "没有符合条件的车辆"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {rows.length === 0
                    ? "采集任务每 10 分钟同步一次，稍后自动出现"
                    : "换个筛选条件或清空搜索词试试"}
                </p>
                {hasFilter ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-3 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    清空筛选
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[11px] text-slate-400">
                    共 {visibleRows.length} 辆{hasFilter ? ` / 全部 ${rows.length} 辆` : ""}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {visibleRows.map((row) => (
                    <VehicleCard key={row.vin} row={row} changedAt={changedMap[row.vin]} />
                  ))}
                </div>
              </>
            )}
          </section>

          <aside className="space-y-3 xl:sticky xl:top-[68px] xl:self-start">
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <h2 className="text-xs font-semibold text-slate-900">版本分布</h2>
              <div className="mt-2.5 space-y-2">
                {versionGroups.length === 0 ? (
                  <p className="text-xs text-slate-400">暂无数据</p>
                ) : (
                  versionGroups.map(([version, count]) => (
                    <div key={version}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[11px] text-slate-600" title={version}>
                          {version}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400">{count}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-300"
                          style={{ width: `${(count / rows.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <h2 className="text-xs font-semibold text-slate-900">最近变化</h2>
              <div className="mt-2.5 space-y-2.5">
                {events.length === 0 ? (
                  <p className="text-xs text-slate-400">暂无版本 / 状态变更</p>
                ) : (
                  events.slice(0, 10).map((event) => (
                    <div key={event.id} className="text-[11px] leading-relaxed">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span>{fmtClock(event.created_at)}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-medium text-slate-600">{event.alias || event.vin}</span>
                      </div>
                      <div className="text-slate-500">
                        {event.kind === "version" ? "Autocar 版本" : event.field}：
                        <span className="text-slate-400 line-through">{prettyStatus(event.old_value)}</span>
                        <span className="mx-1 text-slate-300">→</span>
                        <span className="font-medium text-slate-700">{prettyStatus(event.new_value)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <p className="px-1 text-[10px] leading-relaxed text-slate-400">
              在线状态 = 车端最近一次上报时间，{STALE_DATA_MINUTES} 分钟内视作在线（采集每 10 分钟一次，留一个周期容错）。数据源：Walle 部署平台 + 路测监控 +
              今日车辆任务；页面 30 秒自动刷新。
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Index;
