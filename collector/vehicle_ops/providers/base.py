"""数据源适配器接口。新增一个车厂/平台，只需要实现 fetch()。"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..models import Vehicle


@runtime_checkable
class Provider(Protocol):
    name: str

    def fetch(self) -> list[Vehicle]:
        """拉取全部被监控车辆的当前状态。允许部分车辆缺失，缺失的由调用方按「平台无此车」处理。"""
        ...
