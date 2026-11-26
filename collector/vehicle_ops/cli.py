"""命令行入口：python -m vehicle_ops --config config.json [--dry-run]"""
from __future__ import annotations

import argparse
import datetime as dt
import logging
import sys

from .config import load_config
from .providers import build_provider
from .status import is_abnormal
from .store import SupabaseStore, build_events

TZ = dt.timezone(dt.timedelta(hours=8))
log = logging.getLogger("vehicle_ops")


def _print_table(records: list[dict]) -> None:
    header = f"{'车号':<10} {'Autocar 版本':<44} {'状态':<10} {'约车地点':<6} 心跳"
    print(header)
    print("-" * len(header))
    for rec in records:
        flag = "!" if is_abnormal(rec) else " "
        print(
            f"{rec['alias']:<10} {rec['autocar_version'] or '-':<44} "
            f"{rec['status'] or '-':<10} {rec['place'] or '-':<6} "
            f"{rec['heartbeat_at'] or '-'} {flag}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="vehicle_ops", description="采集车辆状态并同步到 Supabase"
    )
    parser.add_argument("--config", default="config.json", help="配置文件路径")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    parser.add_argument("--no-events", action="store_true", help="不记录变更流水")
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
