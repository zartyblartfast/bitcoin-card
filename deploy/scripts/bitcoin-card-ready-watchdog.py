#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from urllib.request import urlopen

url = "http://127.0.0.1:8787/ready"
state_path = Path("/var/lib/bitcoin-card-dashboard/ready-state.json")
try:
    with urlopen(url, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"/ready returned HTTP {response.status}")
        payload = json.load(response)
    if payload.get("status") != "ready":
        raise RuntimeError(f"unexpected readiness status: {payload.get('status')!r}")
    if payload.get("sourceQuality") != "community-api-derived":
        raise RuntimeError(f"unexpected source quality: {payload.get('sourceQuality')!r}")
    history_length = payload.get("historyLength")
    if not isinstance(history_length, int) or history_length <= 0:
        raise RuntimeError("missing or invalid historyLength")
    if not isinstance(payload.get("dataDate"), str) or not payload["dataDate"]:
        raise RuntimeError("missing dataDate")
    previous = json.loads(state_path.read_text()) if state_path.exists() else None
    if previous and history_length < previous.get("historyLength", 0):
        raise RuntimeError(f"history contracted: {history_length} < {previous['historyLength']}")
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({"historyLength": history_length, "dataDate": payload["dataDate"], "buildRevision": payload.get("buildRevision")}) + "\n")
    print(json.dumps(payload, sort_keys=True))
except Exception as error:
    print(f"bitcoin-card readiness watchdog failed: {error}", file=sys.stderr)
    sys.exit(1)
