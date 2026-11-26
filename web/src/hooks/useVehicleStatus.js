import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const POLL_MS = 30000;

// 没有配置 Supabase，或者显式打开 VITE_DEMO_MODE，就走本地 JSON 演示数据。
// 这样可以做到「不装数据库、不连内网」也能看到完整界面。
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true" || !SUPABASE_URL;

async function loadDemo() {
  const base = import.meta.env.BASE_URL || "/";
  const [statusRes, eventRes] = await Promise.all([
    fetch(`${base}demo/vehicle_status.json`),
    fetch(`${base}demo/vehicle_events.json`),
  ]);

  const rows = statusRes.ok ? await statusRes.json() : [];
  const events = eventRes.ok ? await eventRes.json() : [];

  // 演示数据可能是几天前导出的，把时间整体平移到「刚刚」，界面才不会一直提示过期
  if (!rows.length) return { rows, events };
  const latest = Math.max(...rows.map((row) => new Date(row.collected_at).getTime()));
  const offset = Date.now() - latest;
  const shifted = rows.map((row) => ({
    ...row,
    collected_at: new Date(new Date(row.collected_at).getTime() + offset).toISOString(),
    heartbeat_at: row.heartbeat_at
      ? new Date(new Date(row.heartbeat_at).getTime() + offset).toISOString()
      : null,
  }));

  return { rows: shifted, events };
}

export function useVehicleStatus() {
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    let nextRows = [];
    let nextEvents = [];
    let failure = "";

    if (DEMO_MODE) {
      try {
        const demo = await loadDemo();
        nextRows = demo.rows;
        nextEvents = demo.events;
      } catch (err) {
        failure = `演示数据读取失败：${err.message}`;
      }
    } else {
      const [statusResult, eventResult] = await Promise.all([
        supabase.from("vehicle_status").select("*"),
        supabase.from("vehicle_events").select("*").order("created_at", { ascending: false }).limit(30),
      ]);
      if (statusResult.error) {
        failure = statusResult.error.message;
      } else {
        nextRows = statusResult.data || [];
        nextEvents = eventResult.data || [];
      }
    }

    if (!mounted.current) return;

    if (failure) {
      setError(failure);
      setLoading(false);
      return;
    }

    const sorted = nextRows.slice().sort((a, b) =>
      String(a.alias || "").localeCompare(String(b.alias || ""), "zh-CN", { numeric: true }),
    );

    setRows(sorted);
    setEvents(nextEvents);
    setError("");

    const latest = sorted.reduce((acc, row) => {
      const stamp = row.collected_at ? new Date(row.collected_at).getTime() : 0;
      return stamp > acc ? stamp : acc;
    }, 0);
    setLastSyncedAt(latest ? new Date(latest).toISOString() : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();

    const timer = setInterval(load, POLL_MS);
    let channel = null;

    if (!DEMO_MODE) {
      channel = supabase
        .channel("vehicle-status-stream")
        .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_status" }, () => load())
        .subscribe();
    }

    return () => {
      mounted.current = false;
      clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  return { rows, events, loading, error, lastSyncedAt, demo: DEMO_MODE, refresh: load };
}
