"""配置加载：JSON 文件 + 环境变量覆盖。代码里不出现任何车号/地址/密钥。"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class WatchItem:
    name: str
    alias: str = ""
    vin: str = ""

    @property
    def label(self) -> str:
        return self.alias or self.name


@dataclass
class Config:
    provider: str = "mock"
    stale_minutes: int = 10
    supabase_url: str = ""
    supabase_anon_key: str = ""
    vehicles: list[WatchItem] = field(default_factory=list)

    @property
    def names(self) -> list[str]:
        return [item.name.strip().lower() for item in self.vehicles]

    @property
    def alias_map(self) -> dict[str, str]:
        return {item.name.strip().lower(): item.label for item in self.vehicles}


def load_config(path: str | os.PathLike[str]) -> Config:
    """读取 config.json；SUPABASE_URL / SUPABASE_ANON_KEY 优先于文件里的值（便于 CI 注入）。"""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))

    supabase = raw.get("supabase") or {}
    url = os.environ.get("SUPABASE_URL") or supabase.get("url") or ""
    key = os.environ.get("SUPABASE_ANON_KEY") or supabase.get("anon_key") or ""

    vehicles = [
        WatchItem(
            name=item["name"],
            alias=item.get("alias", ""),
            vin=item.get("vin", ""),
        )
        for item in raw.get("vehicles", [])
        if item.get("name")
    ]
    if not vehicles:
        raise ValueError(f"{path} 里没有配置任何车辆")

    return Config(
        provider=os.environ.get("VEHICLE_PROVIDER") or raw.get("provider", "mock"),
        stale_minutes=int(raw.get("stale_minutes", 10)),
        supabase_url=url.rstrip("/"),
        supabase_anon_key=key,
        vehicles=vehicles,
    )
