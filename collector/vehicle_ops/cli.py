"""命令行入口：python -m vehicle_ops --config config.json [--dry-run]"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys
from pathlib import Path

from .config import load_config
from .providers import build_provider
from .status import is_abnormal
from .store import SupabaseStore, build_events

TZ = dt.timezone(dt.timedelta(hours=8))
log = logging.getLogger("vehicle_ops")


def _print_table(records: list[dict]) -> None:
    header = f"{'车号':<10} {'固件版本':<44} {'状态':<10} {'约车地点':<6} 心跳"
    print(header)
    print("-" * len(header))
    for rec in records:
        flag = "!" if is_abnormal(rec) else " "
        print(
            f"{rec['alias']:<10} {rec['firmware_version'] or '-':<44} "
            f"{rec['status'] or '-':<10} {rec['place'] or '-':<6} "
            f"{rec['heartbeat_at'] or '-'} {flag}"
        )


def export_demo(directory: str, records: list[dict]) -> None:
    """把当前快照写成前端能直接读的 JSON，用于「没有数据库也能看界面」。"""
    target = Path(directory)
    target.mkdir(parents=True, exist_ok=True)
    rows = [{k: v for k, v in rec.items() if k != "payload"} for rec in records]
    (target / "vehicle_status.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    # 演示用的变更记录：内容是编的，只为让「最近变化」一栏有东西看
    now = dt.datetime.now(TZ)
    events = []
    for index, rec in enumerate(rows[:3]):
        events.append(
            {
                "vin": rec["vin"],
                "alias": rec["alias"],
                "kind": "version",
                "field": "固件版本",
                "old_value": "149.demo_legacy_build",
                "new_value": rec["firmware_version"],
                "created_at": (now - dt.timedelta(hours=5 - index * 1.5)).isoformat(),
            }
        )
    if len(rows) > 3:
        events.append(
            {
                "vin": rows[3]["vin"],
                "alias": rows[3]["alias"],
                "kind": "place",
                "field": "约车地点",
                "old_value": "站点A",
                "new_value": rows[3]["place"],
                "created_at": (now - dt.timedelta(minutes=50)).isoformat(),
            }
        )
    events.sort(key=lambda item: item["created_at"], reverse=True)
    (target / "vehicle_events.json").write_text(
        json.dumps(events, ensure_ascii=False, indent=1), encoding="utf-8"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="vehicle_ops", description="采集车辆状态并同步到 Supabase"
    )
    parser.add_argument("--config", default="config.json", help="配置文件路径")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    parser.add_argument("--no-events", action="store_true", help="不记录变更流水")
    parser.add_argument("--export", metavar="DIR", help="只导出演示数据到目录（给前端离线跑，不写库）")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="[%(asctime)s] %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    try:
        config = load_config(args.config)
        provider = build_provider(config)
        log.info("provider=%s 车辆数=%d", provider.name, len(config.vehicles))

        vehicles = provider.fetch()
        now_iso = dt.datetime.now(TZ).isoformat()
        records = [vehicle.to_record(now_iso) for vehicle in vehicles]

        found = {(rec["name"] or rec["vin"]).lower() for rec in records}
        for item in config.vehicles:
            if item.name.lower() not in found:
                log.warning("未采集到: %s", item.name)

        if args.dry_run:
            _print_table(records)
            return 0

        if args.export:
            export_demo(args.export, records)
            log.info("演示数据已导出到 %s", args.export)
            return 0

        store = SupabaseStore(config.supabase_url, config.supabase_anon_key)
        existing = store.fetch_existing()
        events = [] if args.no_events else build_events(existing, records, now_iso)

        store.upsert(records)
        store.insert_events(events)

        log.info("写入 %d 条状态，%d 条变更", len(records), len(events))
        for event in events:
            log.info(
                "变化 %s %s: %s -> %s",
                event["alias"], event["field"], event["old_value"], event["new_value"],
            )
        return 0
    except Exception as exc:  # 采集/网络异常统一按失败退出，交给调度器重试
        log.error("同步失败: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
