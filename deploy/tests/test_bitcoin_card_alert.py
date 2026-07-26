import importlib.util
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "bitcoin-card-ready-alert.py"


def load_alert_module():
    spec = importlib.util.spec_from_file_location("bitcoin_card_ready_alert", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AlertRenderingTests(unittest.TestCase):
    def test_hermes_binary_uses_root_local_cli_when_no_override_is_set(self):
        alert = load_alert_module()

        self.assertEqual(alert.hermes_binary({}), "/root/.local/bin/hermes")

    def test_unit_name_restores_service_suffix_from_systemd_template_instance(self):
        alert = load_alert_module()

        self.assertEqual(
            alert.normalize_unit("bitcoin-card-dashboard-ready"),
            "bitcoin-card-dashboard-ready.service",
        )

    def test_render_alert_includes_failure_and_last_healthy_context(self):
        alert = load_alert_module()

        message = alert.render_alert(
            failed_unit="bitcoin-card-dashboard-ready.service",
            failed_at="2026-07-26T22:30:00Z",
            error="/ready did not become available: connection refused",
            last_healthy={
                "buildRevision": "56be20768dd90ac653fa148ac45fbcb8f9aa8219",
                "dataDate": "2026-07-25",
                "historyLength": 5852,
            },
        )

        self.assertIn("Bitcoin Card watchdog alert", message)
        self.assertIn("bitcoin-card-dashboard-ready.service", message)
        self.assertIn("connection refused", message)
        self.assertIn("56be20768dd", message)
        self.assertIn("2026-07-25", message)
        self.assertIn("5,852", message)
        self.assertIn("2026-07-26T22:30:00Z", message)


if __name__ == "__main__":
    unittest.main()
