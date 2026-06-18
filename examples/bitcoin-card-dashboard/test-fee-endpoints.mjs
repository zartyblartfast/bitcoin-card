import { spawn } from "node:child_process";

const PORT = 8794;
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

function assertBandPoint(point) {
  for (const key of ["minFee", "p10Fee", "p25Fee", "medianFee", "p75Fee", "p90Fee", "maxFee"]) {
    if (typeof point[key] !== "number") throw new Error(`missing numeric ${key}`);
  }
  if (!(point.minFee <= point.p10Fee && point.p10Fee <= point.p25Fee && point.p25Fee <= point.medianFee && point.medianFee <= point.p75Fee && point.p75Fee <= point.p90Fee && point.p90Fee <= point.maxFee)) {
    throw new Error("fee bands are not ordered");
  }
}

try {
  await waitForServer();
  for (const range of ["24h", "1w", "1m"]) {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/fee-history?range=${range}`);
    if (!res.ok) throw new Error(`/api/fee-history?range=${range} returned ${res.status}`);
    const data = await res.json();
    if (data.range !== range) throw new Error(`wrong range: ${data.range}`);
    if (!data.source || !data.sourceQuality || !data.fetchedAt) throw new Error("missing source metadata");
    if (!Array.isArray(data.points) || data.points.length === 0) throw new Error(`missing fee history points for ${range}`);
    assertBandPoint(data.points[0]);
  }

  const badHistory = await fetch(`http://127.0.0.1:${PORT}/api/fee-history?range=5y`);
  if (badHistory.status !== 400) throw new Error(`invalid fee-history range returned ${badHistory.status}`);

  const profileRes = await fetch(`http://127.0.0.1:${PORT}/api/fee-profile?cadence=weekly&buyAmountUsd=100`);
  if (!profileRes.ok) throw new Error(`/api/fee-profile returned ${profileRes.status}`);
  const profile = await profileRes.json();
  if (profile.cadence !== "weekly") throw new Error("wrong profile cadence");
  for (const key of ["recommendedSatVb", "estimatedFeeUsd", "estimatedFeePctOfBuy", "confidence"]) {
    if (typeof profile[key] !== "number") throw new Error(`missing numeric ${key}`);
  }
  if (profile.confidence < 0 || profile.confidence > 1) throw new Error("confidence out of bounds");

  const badProfile = await fetch(`http://127.0.0.1:${PORT}/api/fee-profile?cadence=weekly&buyAmountUsd=0`);
  if (badProfile.status !== 400) throw new Error(`invalid fee-profile returned ${badProfile.status}`);

  console.log(JSON.stringify({ feeHistory: "ok", feeProfile: { recommendedSatVb: profile.recommendedSatVb, estimatedFeePctOfBuy: profile.estimatedFeePctOfBuy, regime: profile.regime } }, null, 2));
} finally {
  child.kill();
}
