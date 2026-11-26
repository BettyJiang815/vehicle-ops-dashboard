"""离线假数据源：不需要任何外部服务和登录态也能把整条链路跑通。"""
from __future__ import annotations

import datetime as dt
import hashlib

from ..models import Vehicle
from ..status import status_label
from .base import Provider

VERSIONS = ["151.demo_basemodel_v4_2", "154.demo_starting_opt", "155.demo_flow_decoder"]
PLACES = ["站点A", "站点B", "站点C", "站点D", "站点E"]
SLOTS = ["08:00-18:00", "09:00-21:00", ""]


class MockProvider(Provider):
    """按车名做稳定散列，同一辆车每次跑出来的版本/地点不变，状态随机跳动。"""

    name = "mock"

    def __init__(self, config):
        self.config = config

    def fetch(self) -> list[Vehicle]:
        now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
        result: list[Vehicle] = []

        for item in self.config.vehicles:
            digest = int(hashlib.sha256(item.name.encode()).hexdigest(), 16)
            version = VERSIONS[digest % len(VERSIONS)]
            place = PLACES[digest % len(PLACES)]
            slot = SLOTS[digest % len(SLOTS)]
            online = digest % 7 != 0  # 约 1/7 的车掉线，方便看告警态
            beat = now - dt.timedelta(minutes=1 if online else 47)

            result.append(
                Vehicle(
                    vin=f"MOCK{item.name}".upper(),
                    alias=item.label,
                    name=item.name,
                    vehicle_type=item.name.split("-")[0].upper(),
                    plate="",
                    firmware_version=version,
                    overall_version=f"{version}_whole",
                    status=status_label(
                        "RUNNING" if online else "",
                        in_platform=True,
                        slot=slot,
                        now=now,
                    ),
                    place=place,
                    purpose="",
                    slot=slot,
                    heartbeat_at=beat.isoformat(),
                    raw={"provider": "mock"},
                )
            )
        return result
