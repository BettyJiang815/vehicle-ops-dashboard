"""统一的车辆状态模型：所有 provider 都必须产出它，后面的存储/告警层就不用关心数据源。"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Vehicle:
    """一辆车的当前状态。字段与 vehicle_status 表一一对应。"""

    vin: str
    alias: str = ""
    name: str = ""
    vehicle_type: str = ""
    plate: str = ""
    autocar_version: str = ""
    overall_version: str = ""
    status: str = ""
    place: str = ""
    purpose: str = ""
    slot: str = ""
    heartbeat_at: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> str:
        """业务主键：优先 VIN，没有 VIN 就退化成平台车名。"""
        return (self.vin or self.name).strip().upper()

    def to_record(self, collected_at: str) -> dict[str, Any]:
        record = asdict(self)
        record.pop("raw")
        record["payload"] = self.raw
        record["collected_at"] = collected_at
        return record
