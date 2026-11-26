"""存储层：Supabase(PostgREST) 的 upsert + 变更流水。纯标准库实现，无第三方依赖。"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

# 哪些字段变了要记一条事件：(kind, 展示名, 列名, 是否做状态归一)
FIELD_SPECS = (
    ("version", "Autocar 版本", "autocar_version", False),
    ("status", "运行状态", "status", True),
    ("place", "约车地点", "place", False),
)


def build_events(existing: dict[str, dict], records: list[dict], now_iso: str) -> list[dict]:
    """对比旧快照与新记录，产出待写入的事件。首次入库（无旧值）不记事件。"""
    from .status import norm_status

    events: list[dict] = []
    for rec in records:
        old = existing.get(rec["vin"])
        if not old:
            continue
        for kind, field, column, normalize in FIELD_SPECS:
            before = (old.get(column) or "").strip()
            after = (rec.get(column) or "").strip()
            if normalize:
                before, after = norm_status(before), norm_status(after)
            if before and after and before != after:
                events.append(
                    {
                        "vin": rec["vin"],
                        "alias": rec.get("alias", ""),
                        "kind": kind,
                        "field": field,
                        "old_value": before,
                        "new_value": after,
                        "created_at": now_iso,
                    }
                )
    return events


class SupabaseStore:
    """只依赖 PostgREST 的 REST 接口，换自建 PostgREST 也一样能用。"""

    def __init__(self, url: str, anon_key: str, timeout: int = 60):
        if not url or not anon_key:
            raise ValueError("缺少 supabase.url / supabase.anon_key")
        self.base = url.rstrip("/") + "/rest/v1"
        self.key = anon_key
        self.timeout = timeout

    def _request(self, path: str, *, method: str = "GET", body=None, prefer: str | None = None):
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Content-Type", "application/json")
        if prefer:
            req.add_header("Prefer", prefer)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode() or "[]"
        except urllib.error.HTTPError as exc:  # 把服务端报错带出来，别吞掉
            detail = exc.read().decode(errors="replace")[:400]
            raise RuntimeError(f"Supabase {method} {path} -> {exc.code}: {detail}") from exc
        if not raw.strip():
            return []
        return json.loads(raw) if raw.lstrip().startswith(("[", "{")) else raw

    def fetch_existing(self) -> dict[str, dict]:
        rows = self._request("/vehicle_status?select=vin,autocar_version,status,place")
        return {row["vin"]: row for row in rows if isinstance(row, dict) and row.get("vin")}

    def upsert(self, records: list[dict]) -> None:
        if not records:
            return
        self._request(
            "/vehicle_status?on_conflict=vin",
            method="POST",
            body=records,
            prefer="resolution=merge-duplicates,return=minimal",
        )

    def insert_events(self, events: list[dict]) -> None:
        if not events:
            return
        self._request(
            "/vehicle_events",
            method="POST",
            body=events,
            prefer="return=minimal",
        )
