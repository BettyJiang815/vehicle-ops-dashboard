export const STALE_MINUTES = 20;
export const STALE_DATA_MINUTES = 20;

export function parseTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}T/.test(text) || text.endsWith("Z")) return direct;
  }
  const normalized = text.replace(/-/g, "/");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function fmtAgo(value) {
  const date = parseTime(value);
  if (!date) return "-";
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 0) return "刚刚";
  if (sec < 60) return `${sec} 秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

export function fmtClock(value) {
  const date = parseTime(value);
  if (!date) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function minutesSince(value) {
  const date = parseTime(value);
  if (!date) return null;
  return (Date.now() - date.getTime()) / 60000;
}

export function isOnline(row) {
  const mins = minutesSince(row.heartbeat_at);
  return mins !== null && mins <= STALE_MINUTES;
}

export const RAW_STATUS_CN = {
  RUNNING: "运行中",
  TERMINATED: "已结束",
  INIT_FAILURE: "初始化失败",
  UNKNOWN_STATUS: "未知",
  PRE_RUN: "发车前",
  POST_RUN: "已收车",
  ONLINE: "在线",
  OFFLINE: "离线",
};

export function prettyStatus(value) {
  const text = String(value || "").trim();
  return RAW_STATUS_CN[text] || text || "空";
}

export const STATUS_STYLES = {
  运行中: {
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  初始化失败: {
    pill: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
  未知: {
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  已结束: {
    pill: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  已收车: {
    pill: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  "平台无此车": {
    pill: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
};

export function statusStyle(label) {
  if (STATUS_STYLES[label]) return STATUS_STYLES[label];
  if (!label || label === "无法获取版本") {
    return { pill: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" };
  }
  if (label.includes("失败")) {
    return { pill: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" };
  }
  if (label.includes("排班中")) {
    return { pill: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" };
  }
  return { pill: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" };
}

export function isAbnormal(row) {
  if (!row) return false;
  if (!row.firmware_version) return true;
  if (row.status === "初始化失败" || row.status === "平台无此车") return true;
  return false;
}
