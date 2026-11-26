"""provider 工厂：配置里写 provider: mock，或注册你自己的实现。"""
from __future__ import annotations

from .base import Provider


def build_provider(config) -> Provider:
    name = (config.provider or "mock").strip().lower()
    if name == "mock":
        from .mock import MockProvider

        return MockProvider(config)

    # 接入真实平台：在 providers/ 下新建 your_platform.py，实现 fetch() -> list[Vehicle]，
    # 然后在这里注册。存储层和前端都不需要改。
    raise ValueError(f"未知 provider: {name}（内置 mock；请按 docs/maintenance.md 添加自己的实现）")


__all__ = ["Provider", "build_provider"]
