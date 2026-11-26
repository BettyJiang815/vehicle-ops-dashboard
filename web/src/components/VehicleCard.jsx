import { Activity, CarFront, Clock, ExternalLink, Flag, MapPin, Sparkles, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  STALE_MINUTES,
  STALE_DATA_MINUTES,
  fmtAgo,
  fmtClock,
  isOnline,
  minutesSince,
  statusStyle,
} from "@/lib/vehicle-format";

// 可选：配置后卡片会渲染「在源平台查看」入口；留空则整块隐藏。
// 例如 VITE_VEHICLE_SOURCE_URL=https://your-platform.example.com/vehicles
const VEHICLE_SOURCE_URL = import.meta.env.VITE_VEHICLE_SOURCE_URL || "";

const TONES = {
  default: "text-slate-700",
  danger: "text-rose-600",
  success: "text-emerald-600",
  muted: "text-slate-400",
};

const MetaRow = ({ icon: Icon, label, value, tone = "default" }) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
    <span className={cn("truncate text-xs font-medium", TONES[tone])} title={value}>
      {value}
    </span>
  </div>
);

export default function VehicleCard({ row, changedAt }) {
  const style = statusStyle(row.status);
  const dataAge = minutesSince(row.collected_at);
  const dataStale = dataAge !== null && dataAge > STALE_DATA_MINUTES;
  const online = !dataStale && isOnline(row);
  const beatMinutes = minutesSince(row.heartbeat_at);
  const beatStale = beatMinutes !== null && beatMinutes > STALE_MINUTES;
  const missingVersion = !row.autocar_version;
  const alert = missingVersion || row.status === "初始化失败" || row.status === "平台无此车";
  const searchKey = row.name || row.vin;

  // 源平台一般不支持 URL 预填车号，所以点开的同时把车号复制到剪贴板，粘一下就能查
  const handleOpenSource = async () => {
    if (!VEHICLE_SOURCE_URL) return;
    try {
      await navigator.clipboard.writeText(searchKey);
      toast.success(`已复制 ${searchKey}，粘贴到源平台搜索框即可`);
    } catch (e) {
      toast.message(`在源平台搜索框输入 ${searchKey}`);
    }
  };

  const sourceLabel = (
    <>
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      在线状态
      {VEHICLE_SOURCE_URL ? <ExternalLink className="h-2.5 w-2.5 opacity-70" /> : null}
    </>
  );

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)]",
        alert ? "border-rose-200" : "border-slate-200/80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
            {row.alias || row.name || row.vin}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
            <CarFront className="h-3 w-3" />
            <span>{row.vehicle_type || "-"}</span>
            {row.plate ? <span className="text-slate-300">|</span> : null}
            {row.plate ? <span>{row.plate}</span> : null}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            style.pill,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
          {row.status || "无状态"}
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50/80 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">
            固件版本
          </span>
          {changedAt ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              <Sparkles className="h-2.5 w-2.5" />
              刚刚更新
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "mt-1 line-clamp-2 break-all font-mono text-[12.5px] font-semibold leading-[1.5]",
            missingVersion ? "text-rose-600" : "text-slate-900",
          )}
          title={row.autocar_version}
        >
          {row.autocar_version || "无记录"}
        </div>
        {row.overall_version ? (
          <div className="mt-1 truncate text-[10px] text-slate-400" title={row.overall_version}>
            整车 {row.overall_version}
          </div>
        ) : null}
      </div>

      <div className="mt-2 divide-y divide-slate-50">
        <MetaRow icon={MapPin} label="约车地点" value={row.place || "-"} />
        {row.purpose ? <MetaRow icon={Flag} label="约车目的" value={row.purpose} /> : null}
        <MetaRow icon={Clock} label="今日班次" value={row.slot || "-"} />
        <div className="flex items-center justify-between gap-3 py-1.5">
          {VEHICLE_SOURCE_URL ? (
            <a
              href={VEHICLE_SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              onClick={handleOpenSource}
              title={`来源：源平台的「最近上报时间」${row.heartbeat_at ? `，本次上报 ${fmtClock(row.heartbeat_at)}` : ""}。点击打开页面并复制车号`}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 transition hover:text-slate-600"
            >
              {sourceLabel}
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">{sourceLabel}</span>
          )}
          <span
            className={cn(
              "truncate text-xs font-medium",
              dataStale
                ? "text-amber-600"
                : online
                  ? "text-emerald-600"
                  : beatStale
                    ? "text-rose-600"
                    : "text-slate-500",
            )}
            title={row.heartbeat_at ? `最近上报：${fmtClock(row.heartbeat_at)}` : "暂无上报记录"}
          >
            {dataStale
              ? `数据未更新 · ${fmtAgo(row.collected_at)}`
              : row.heartbeat_at
                ? `${online ? "在线" : "离线"} · ${fmtAgo(row.heartbeat_at)}`
                : "-"}
          </span>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div className="min-w-0 text-[10px] leading-relaxed text-slate-400">
          <div className="truncate" title={row.name}>
            {row.name || "-"}
          </div>
          <div>{row.collected_at ? `采集 ${fmtClock(row.collected_at)}` : "-"}</div>
        </div>
        {VEHICLE_SOURCE_URL ? (
          <a
            href={VEHICLE_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            onClick={handleOpenSource}
            title={`打开源平台（自动复制 ${searchKey}，粘贴即可查）`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            <ExternalLink className="h-3 w-3" />
            源平台
          </a>
        ) : null}
      </div>
    </article>
  );
}
