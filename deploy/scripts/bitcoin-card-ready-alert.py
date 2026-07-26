#!/usr/bin/env python3
"""Send a concise Telegram alert when the Bitcoin Card readiness watchdog fails."""

import argparse
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Mapping

STATE_PATH = Path("/var/lib/bitcoin-card-dashboard/ready-state.json")
DEFAULT_PROFILE = "btc-drawdown"


def render_alert(*, failed_unit: str, failed_at: str, error: str, last_healthy: dict) -> str:
    revision = str(last_healthy.get("buildRevision") or "unknown")[:12]
    data_date = str(last_healthy.get("dataDate") or "unknown")
    history_length = last_healthy.get("historyLength")
    history = f"{history_length:,}" if isinstance(history_length, int) else "unknown"
    return "\n".join(
        [
            "Bitcoin Card watchdog alert",
            f"Service: {failed_unit}",
            f"Failure: {error}",
            f"Last healthy revision: {revision}",
            f"Last healthy data: {data_date} ({history} history rows)",
            f"UTC: {failed_at}",
        ]
    )


def load_last_healthy() -> dict:
    try:
        value = json.loads(STATE_PATH.read_text())
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def recent_failure(unit: str) -> str:
    completed = subprocess.run(
        ["journalctl", "-u", unit, "-n", "20", "--no-pager", "-o", "cat"],
        capture_output=True,
        text=True,
        check=False,
    )
    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        if "bitcoin-card readiness watchdog failed:" in line:
            return line.split("bitcoin-card readiness watchdog failed:", 1)[1].strip()
    return lines[-1] if lines else "readiness watchdog failed; no journal detail available"


def hermes_binary(environ: Mapping[str, str]) -> str:
    return environ.get("HERMES_BIN", "/root/.local/bin/hermes").strip() or "/root/.local/bin/hermes"


def send(message: str) -> None:
    target = os.environ.get("TELEGRAM_ALERT_TARGET", "").strip()
    if not target:
        raise RuntimeError("TELEGRAM_ALERT_TARGET is not configured")
    profile = os.environ.get("HERMES_PROFILE", DEFAULT_PROFILE).strip() or DEFAULT_PROFILE
    completed = subprocess.run(
        [hermes_binary(os.environ), "--profile", profile, "send", "--quiet", "--to", target, message],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode:
        detail = completed.stderr.strip() or completed.stdout.strip() or "unknown send failure"
        raise RuntimeError(f"Telegram delivery failed: {detail}")


def normalize_unit(unit: str) -> str:
    return unit if "." in unit else f"{unit}.service"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--unit", default="bitcoin-card-dashboard-ready.service")
    parser.add_argument("--error", help="override journal-derived failure detail")
    parser.add_argument("--at", dest="failed_at", help="override UTC timestamp")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    unit = normalize_unit(args.unit)

    message = render_alert(
        failed_unit=unit,
        failed_at=args.failed_at or datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        error=args.error or recent_failure(unit),
        last_healthy=load_last_healthy(),
    )
    if args.dry_run:
        print(message)
        return 0
    send(message)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"bitcoin-card watchdog alert failed: {error}", file=sys.stderr)
        raise SystemExit(1)
