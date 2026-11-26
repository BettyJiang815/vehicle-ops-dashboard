"""核心逻辑单测：不依赖网络、不依赖任何外部服务，CI 里跑这个。"""
from __future__ import annotations

import datetime as dt
import unittest

from vehicle_ops.models import Vehicle
from vehicle_ops.status import in_slot, is_abnormal, norm_status, status_label
from vehicle_ops.store import build_events


class InSlotTest(unittest.TestCase):
    def test_inside_single_window(self):
        now = dt.datetime(2026, 11, 26, 10, 0)
        self.assertIs(in_slot("08:00-18:00", now), True)

    def test_outside_single_window(self):
        now = dt.datetime(2026, 11, 26, 20, 0)
        self.assertIs(in_slot("08:00-18:00", now), False)

    def test_multiple_windows_and_fullwidth_tilde(self):
        now = dt.datetime(2026, 11, 26, 14, 0)
        self.assertIs(in_slot("08:00～12:00,13:00-18:00", now), True)

    def test_unknown_when_empty(self):
        self.assertIsNone(in_slot(""))
        self.assertIsNone(in_slot(None))


class StatusLabelTest(unittest.TestCase):
    def test_known_code_translated(self):
        self.assertEqual(status_label("RUNNING"), "运行中")
        self.assertEqual(status_label("POST_RUN"), "已收车")

    def test_unknown_code_passthrough(self):
        self.assertEqual(status_label("SOMETHING_NEW"), "SOMETHING_NEW")

    def test_falls_back_to_slot_inference(self):
        now = dt.datetime(2026, 11, 26, 10, 0)
        self.assertEqual(status_label("", slot="08:00-18:00", now=now), "排班中*")
        self.assertEqual(status_label("", slot="20:00-22:00", now=now), "未到班次*")
        self.assertEqual(status_label("", slot=""), "无实时状态")

    def test_platform_missing_wins(self):
        self.assertEqual(status_label("RUNNING", in_platform=False), "平台无此车")

    def test_norm_status_idempotent(self):
        self.assertEqual(norm_status("POST_RUN"), "已收车")
        self.assertEqual(norm_status("已收车"), "已收车")


class BuildEventsTest(unittest.TestCase):
    def setUp(self):
        self.now = "2026-11-26T10:00:00+08:00"

    def _record(self, **kwargs):
        base = {
            "vin": "VIN1",
            "alias": "DEMO-001",
            "autocar_version": "155.1",
            "status": "运行中",
            "place": "站点A",
        }
        base.update(kwargs)
        return base

    def test_no_event_on_first_run(self):
        self.assertEqual(build_events({}, [self._record()], self.now), [])

    def test_version_change(self):
        existing = {"VIN1": {"vin": "VIN1", "autocar_version": "154.9", "status": "运行中", "place": "站点A"}}
        events = build_events(existing, [self._record()], self.now)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["kind"], "version")
        self.assertEqual(events[0]["new_value"], "155.1")

    def test_status_normalized_before_compare(self):
        """旧库里是原始码、新记录是中文，不应该被当成业务变化。"""
        existing = {"VIN1": {"vin": "VIN1", "autocar_version": "155.1", "status": "POST_RUN", "place": "站点A"}}
        self.assertEqual(build_events(existing, [self._record(status="已收车")], self.now), [])

    def test_place_change(self):
        existing = {"VIN1": {"vin": "VIN1", "autocar_version": "155.1", "status": "运行中", "place": "站点B"}}
        events = build_events(existing, [self._record()], self.now)
        self.assertEqual([event["kind"] for event in events], ["place"])

    def test_empty_new_value_does_not_raise_event(self):
        """采集偶发缺字段时不要把已知值覆盖成空还记一条变化。"""
        existing = {"VIN1": {"vin": "VIN1", "autocar_version": "155.1", "status": "运行中", "place": "站点A"}}
        self.assertEqual(build_events(existing, [self._record(place="")], self.now), [])


class VehicleTest(unittest.TestCase):
    def test_key_prefers_vin(self):
        self.assertEqual(Vehicle(vin="abc", name="demo-001").key, "ABC")

    def test_key_falls_back_to_name(self):
        self.assertEqual(Vehicle(vin="", name="demo-001").key, "DEMO-001")

    def test_to_record_keeps_raw_payload(self):
        record = Vehicle(vin="V1", raw={"a": 1}).to_record("2026-11-26T10:00:00+08:00")
        self.assertEqual(record["payload"], {"a": 1})
        self.assertEqual(record["collected_at"], "2026-11-26T10:00:00+08:00")
        self.assertNotIn("raw", record)

    def test_abnormal_when_version_missing(self):
        self.assertTrue(is_abnormal({"autocar_version": "", "status": "运行中"}))
        self.assertTrue(is_abnormal({"autocar_version": "155.1", "status": "初始化失败"}))
        self.assertFalse(is_abnormal({"autocar_version": "155.1", "status": "运行中"}))


if __name__ == "__main__":
    unittest.main()
