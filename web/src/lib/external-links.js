// 外部平台链接模板：用 {vin} {name} {plate} {heartbeat} {dayStart} {dayEnd} 占位
// 开源版不内置任何平台地址：在 .env.local 里配 VITE_MONITOR_URL_TEMPLATE /
// VITE_TASK_URL_TEMPLATE / VITE_VEHICLE_SOURCE_URL 才会出现对应按钮。
const DEFAULT_MONITOR_URL = "";
const DEFAULT_TASK_URL = "";

const pad = (n) => String(n).padStart(2, "0");

export function toDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function fill(template, values) {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? encodeURIComponent(values[key] || "") : match,
  );
}

/** 根据一辆车生成跳转链接；没配模板就返回空字符串，按钮自动隐藏 */
export function buildLinks(row) {
  const heartbeat = toDateTime(row.heartbeat_at) || toDateTime(new Date());
  const day = toDateTime(row.collected_at || new Date()).slice(0, 10) || toDateTime(new Date()).slice(0, 10);

  const values = {
    vin: row.vin || "",
    name: row.name || "",
    plate: row.plate || "",
    alias: row.alias || "",
    heartbeat,
    dayStart: `${day} 00:00:00`,
    dayEnd: `${day} 23:59:59`,
  };

  return {
    monitor: fill(import.meta.env.VITE_MONITOR_URL_TEMPLATE || DEFAULT_MONITOR_URL, values),
    tasks: fill(import.meta.env.VITE_TASK_URL_TEMPLATE || DEFAULT_TASK_URL, values),
    source: import.meta.env.VITE_VEHICLE_SOURCE_URL || "",
  };
}
