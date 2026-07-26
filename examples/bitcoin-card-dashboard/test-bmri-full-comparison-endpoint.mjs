import { spawn } from "node:child_process";

const PORT = 8797;
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

try {
  await waitForServer();
  const response = await fetch(`http://127.0.0.1:${PORT}/api/bmri-full-comparison`);
  if (!response.ok) throw new Error(`/api/bmri-full-comparison returned ${response.status}`);
  const data = await response.json();
  if (data.source?.sourceQuality !== "public-chart-scrape") throw new Error(`wrong source quality: ${data.source?.sourceQuality}`);
  if (!/Checkonchain/.test(data.source?.full || "")) throw new Error(`wrong source: ${data.source?.full}`);
  if (typeof data.latest?.fullIndex !== "number" || typeof data.latest?.liteIndex !== "number") throw new Error("missing explicit full/lite comparison values");
  if (!Array.isArray(data.history) || data.history.length < 3000) throw new Error(`missing long comparison history: ${data.history?.length}`);
  console.log(JSON.stringify({ sourceQuality: data.source.sourceQuality, dataDate: data.latest.date, historyLength: data.history.length }, null, 2));
} finally {
  child.kill();
}
