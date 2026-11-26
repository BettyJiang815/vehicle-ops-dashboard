import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const POLL_MS = 30000;

/**
 * 数据来源：supabase 的 vehicle_status / vehicle_events。
 * 三重保障：进页面拉一次 + 30s 轮询 + Realtime 行变更订阅（订阅不可用时自动退化为轮询）。
 */
export function useVehicleStatus() {
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const [statusResult, eventResult] = await Promise.all([
      supabase.from("vehicle_status").select("*"),
      supabase
        .from("vehicle_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (!mounted.current) return;

    if (statusResult.error) {
      setError(statusResult.error.message);
      setLoading(false);
      return;
    }

    const sorted = (statusResult.data || []).slice().sort((a, b) =>
      String(a.alias || "").localeCompare(String(b.alias || ""), "zh-CN", {
        numeric: true,
      }),
    );

    setRows(sorted);
    setEvents(eventResult.data || []);

    const latest = sorted.reduce((acc, row) => {
      const stamp = row.collected_at ? new Date(row.collected_at).getTime() : 0;
      return stamp > acc ? stamp : acc;
    }, 0);

    setLastSyncedAt(latest ? new Date(latest).toISOString() : null);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();

    const timer = setInterval(load, POLL_MS);
    const channel = supabase
      .channel("vehicle-status-stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_status" },
        () => load(),
      )
      .subscribe();

    return () => {
      mounted.current = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { rows, events, loading, error, lastSyncedAt, refresh: load };
}
