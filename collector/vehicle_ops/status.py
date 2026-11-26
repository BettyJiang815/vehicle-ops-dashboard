"""状态码翻译与展示口径。集中放这里，前端只消费中文标签。"""
from __future__ import annotations

import datetime as dt

# 数据源里的原始状态码 -> 展示文案。遇到未知码原样透出，方便发现新状态。
STATUS_MAP: dict[str, str] = {
    "RUNNING": "运行中",
    "TERMINATED": "已结束",
    "INIT_FAILURE": "初始化失败",
    "UNKNOWN_STATUS": "未知",
    "PRE_RUN": "发车前",
    "POST_RUN": "已收车",
    "ONLINE": "在线",
    "OFFLINE": "离线",
}

ABNORMAL_STATUSES = {"初始化失败", "平台无此车"}


def norm_status(value: str | None) -> str:
    """原始码 -> 中文；已经是中文就原样返回。比较新旧值前必须先归一，避免文案升级被当成业务变化。"""
    text = (value or "").strip()
    return STATUS_MAP.get(text, text)


def in_slot(slot: str | None, now: dt.datetime | None = None) -> bool | None:
    """判断当前是否落在约车班次内。

    返回 True（在班次内）/ False（不在）/ None（没有班次信息）。
    支持 "08:00-18:00"、"08:00~12:00,13:00-18:00" 这类写法。
    """
    if not slot:
        return None

    now = now or dt.datetime.now()
    stamp = now.strftime("%H:%M")
    segments = str(slot).replace("～", "-").replace("~", "-").split(",")

    for part in segments:
        part = part.strip()
        if "-" not in part:
            continue
        start, _, end = part.partition("-")
        start, end = start.strip(), end.strip()
        if len(start) < 4 or len(end) < 4:
            continue
        if start <= stamp <= end:
            return True
    return False


def status_label(
    status_code: str | None,
    *,
    in_platform: bool = True,
    slot: str | None = None,
    now: dt.datetime | None = None,
) -> str:
    """把「状态码 + 是否在平台 + 班次」合成用户看到的那一句状态。

    路测车有真实状态；运营车不在路测监控里，只能用班次推算，文案带 * 表示推算值。
    """
    if not in_platform:
        return "平台无此车"
    if status_code:
        return norm_status(status_code)

    active = in_slot(slot, now)
    if active is True:
        return "排班中*"
    if active is False:
        return "未到班次*"
    return "无实时状态"


def is_abnormal(row: dict) -> bool:
    """前端 KPI「异常车辆」的口径，保持前后端一致。"""
    if not row.get("firmware_version"):
        return True
    return row.get("status") in ABNORMAL_STATUSES
