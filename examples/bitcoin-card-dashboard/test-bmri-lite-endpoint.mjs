import { spawn } from "node:child_process";

const PORT = 8795;
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (d) => { output += d; });
child.stderr.on("data", (d) => { output += d; });

async function waitForServer() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/summary`);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start; output=${output}`);
}

function assertIndependentMetadata(data) {
  if (typeof data.generatedAt !== "string") throw new Error("missing API response generatedAt");
  if (data.source?.name !== "Coin Metrics Community API") throw new Error(`wrong source: ${data.source?.name}`);
  if (data.source?.sourceQuality !== "community-api-derived") throw new Error(`wrong source quality: ${data.source?.sourceQuality}`);
  if (typeof data.dataDate !== "string" || typeof data.fetchedAt !== "string") throw new Error("missing data freshness metadata");
  if (!Number.isInteger(data.historyLength) || data.historyLength < 1400) throw new Error(`invalid history length: ${data.historyLength}`);
  if (!data.latest || data.latest.date !== data.dataDate || !Number.isFinite(data.latest.liteIndex) || data.latest.liteIndex < 0 || data.latest.liteIndex > 100) {
    throw new Error("invalid latest independent BMRI-lite point");
  }
}

try {
  await waitForServer();
  const latestResponse = await fetch(`http://127.0.0.1:${PORT}/api/bmri-lite`);
  if (!latestResponse.ok) throw new Error(`/api/bmri-lite returned ${latestResponse.status}`);
  const latest = await latestResponse.json();
  assertIndependentMetadata(latest);
  if ("history" in latest) throw new Error("latest endpoint must remain compact and omit history");

  const historyResponse = await fetch(`http://127.0.0.1:${PORT}/api/bmri-lite/history`);
  if (!historyResponse.ok) throw new Error(`/api/bmri-lite/history returned ${historyResponse.status}`);
  const history = await historyResponse.json();
  assertIndependentMetadata(history);
  if (!Array.isArray(history.history) || history.history.length !== history.historyLength) throw new Error("missing independent history");
  if (history.fetchedAt !== latest.fetchedAt) throw new Error("latest and history responses did not share the short in-process cache");

  const secondLatestResponse = await fetch(`http://127.0.0.1:${PORT}/api/bmri-lite`);
  if (!secondLatestResponse.ok) throw new Error(`/api/bmri-lite second request returned ${secondLatestResponse.status}`);
  const secondLatest = await secondLatestResponse.json();
  if (secondLatest.fetchedAt !== latest.fetchedAt) throw new Error("independent BMRI-lite response was not served from the short in-process cache");

  console.log(JSON.stringify({
    sourceQuality: latest.source.sourceQuality,
    dataDate: latest.dataDate,
    historyLength: latest.historyLength,
    cached: true,
  }, null, 2));
} finally {
  child.kill();
}
