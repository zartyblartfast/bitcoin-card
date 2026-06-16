import { spawn } from "node:child_process";

const PORT = 8792;
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
  const res = await fetch(`http://127.0.0.1:${PORT}/api/bitcoin-risk`);
  if (!res.ok) throw new Error(`/api/bitcoin-risk returned ${res.status}`);
  const data = await res.json();
  if (data.metric !== "bitcoin-risk-composite") throw new Error(`wrong metric: ${data.metric}`);
  if (typeof data.riskScore !== "number") throw new Error("missing riskScore");
  if (!data.components?.mvrvZDerived || !data.components?.puellIssuance) throw new Error("missing component breakdown");
  if (!Array.isArray(data.history) || data.history.length < 1000) throw new Error(`missing long history: ${data.history?.length}`);
  console.log(JSON.stringify({
    metric: data.metric,
    dataDate: data.dataDate,
    riskScore: data.riskScore,
    band: data.band,
    components: Object.fromEntries(Object.entries(data.components).map(([k, v]) => [k, { score: v.score, value: v.value }])),
    history: data.history.length,
  }, null, 2));
} finally {
  child.kill();
}
