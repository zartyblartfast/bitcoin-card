#!/usr/bin/env python3
"""Send a daily Bitcoin Card API snapshot to the configured Telegram chat."""

import argparse
import json
import os
import subprocess
import sys
from typing import Mapping
from urllib.request import urlopen

SUMMARY_URL = "http://127.0.0.1:8787/api/summary"
READY_URL = "http://127.0.0.1:8787/ready"
DEFAULT_PROFILE = "btc-drawdown"


def fetch_json(url: str) -> dict:
    with urlopen(url, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f"{url} returned HTTP {response.status}")
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise RuntimeError(f"{url} returned an invalid JSON payload")
    return payload


def render_summary(summary: dict, readiness: dict) -> str:
    price = summary.get("price") or {}
    blocks = summary.get("blockHeight") or {}
    fees = summary.get("fees") or {}
    mining = summary.get("mining") or {}
    supply = summary.get("supply") or {}

    price_value = price.get("value")
    if not isinstance(price_value, (int, float)):
        raise RuntimeError("summary is missing a usable BTC price")
    block_height = blocks.get("value")
    if not isinstance(block_height, int):
        raise RuntimeError("summary is missing a usable block height")

    fee_values = [fees.get(key) for key in ("fastestFee", "halfHourFee", "hourFee")]
    fee_text = " / ".join(str(value) if isinstance(value, int) else "?" for value in fee_values)
    spread = price.get("spread")
    spread_text = f"; source spread ${spread:,.2f}" if isinstance(spread, (int, float)) else ""
    hashrate = mining.get("hashrateEhS")
    hashrate_text = f"{hashrate:,.1f} EH/s" if isinstance(hashrate, (int, float)) else "unavailable"
    difficulty = mining.get("difficulty")
    difficulty_text = f"{difficulty:,.0f}" if isinstance(difficulty, (int, float)) else "unavailable"
    current_supply = supply.get("currentSupply")
    unmined = supply.get("unmined")
    mined_text = f"{current_supply:,.0f} BTC mined" if isinstance(current_supply, (int, float)) else "supply unavailable"
    remaining_text = f"{unmined:,.0f} remaining" if isinstance(unmined, (int, float)) else "remaining unavailable"
    blocks_until_halving = supply.get("blocksUntilHalving")
    halving_text = f"{blocks_until_halving:,} blocks" if isinstance(blocks_until_halving, int) else "unavailable"
    bmri_date = readiness.get("dataDate", "unavailable")
    bmri_rows = readiness.get("historyLength")
    bmri_text = f"{bmri_date} ({bmri_rows:,} rows)" if isinstance(bmri_rows, int) else str(bmri_date)

    return "\n".join(
        [
            "Bitcoin daily snapshot",
            f"Price: ${price_value:,.2f} USD — {price.get('agreement', 'unavailable')}{spread_text}",
            f"Block height: {block_height:,} — {blocks.get('agreement', 'unavailable')}",
            f"Fees (fast / 30m / 1h): {fee_text} sat/vB",
            f"Mining: {hashrate_text}; difficulty {difficulty_text}",
            f"Supply: {mined_text}; {remaining_text}",
            f"Next halving: {halving_text} remaining",
            f"BMRI data: {bmri_text}",
        ]
    )


def hermes_binary(environ: Mapping[str, str]) -> str:
    return environ.get("HERMES_BIN", "/root/.local/bin/hermes").strip() or "/root/.local/bin/hermes"


def send(message: str) -> None:
    target = os.environ.get("TELEGRAM_ALERT_TARGET", "").strip()
    if not target:
        raise RuntimeError("TELEGRAM_ALERT_TARGET is not configured")
    profile = os.environ.get("HERMES_PROFILE", DEFAULT_PROFILE).strip() or DEFAULT_PROFILE
    result = subprocess.run(
        [hermes_binary(os.environ), "--profile", profile, "send", "--quiet", "--to", target, message],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown send failure"
        raise RuntimeError(f"Telegram delivery failed: {detail}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    message = render_summary(fetch_json(SUMMARY_URL), fetch_json(READY_URL))
    if args.dry_run:
        print(message)
        return 0
    send(message)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"bitcoin-card daily summary failed: {error}", file=sys.stderr)
        raise SystemExit(1)
