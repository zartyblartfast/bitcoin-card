import importlib.util
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "bitcoin-card-daily-summary.py"


def load_summary_module():
    spec = importlib.util.spec_from_file_location("bitcoin_card_daily_summary", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DailySummaryRenderingTests(unittest.TestCase):
    def test_render_summary_includes_core_api_stats(self):
        summary = load_summary_module()

        message = summary.render_summary(
            {
                "generatedAt": "2026-07-26T09:00:00Z",
                "price": {"value": 100123.45, "currency": "USD", "agreement": "verified", "spread": 12.34},
                "blockHeight": {"value": 905000, "agreement": "verified"},
                "fees": {"fastestFee": 5, "halfHourFee": 3, "hourFee": 2},
                "mining": {"hashrateEhS": 850.2, "difficulty": 123456789},
                "supply": {"currentSupply": 19900000, "unmined": 1100000, "blocksUntilHalving": 120000, "nextHalvingEta": "2028-04-01T00:00:00Z"},
            },
            {"dataDate": "2026-07-25", "historyLength": 5852},
        )

        self.assertIn("Bitcoin daily snapshot", message)
        self.assertIn("$100,123.45", message)
        self.assertIn("verified", message)
        self.assertIn("905,000", message)
        self.assertIn("5 / 3 / 2 sat/vB", message)
        self.assertIn("850.2 EH/s", message)
        self.assertIn("19,900,000 BTC mined", message)
        self.assertIn("120,000 blocks", message)
        self.assertIn("BMRI data: 2026-07-25 (5,852 rows)", message)


if __name__ == "__main__":
    unittest.main()
