import { spawn } from "node:child_process";

const PORT = 8798;
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: String(PORT), BUILD_REVISION: "test-revision" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (d) => { output += d; });
child.stderr.on("data", (d) => { output += d; });

async function waitForServer() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/summary`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start; output=${output}`);
}

try {
  await waitForServer();
  const health = await fetch(`http://127.0.0.1:${PORT}/health`);
  if (!health.ok) throw new Error(`/health returned ${health.status}`);
  const healthBody = await health.json();
  if (healthBody.status !== "ok" || healthBody.buildRevision !== "test-revision") throw new Error("invalid health response");

  const ready = await fetch(`http://127.0.0.1:${PORT}/ready`);
  if (!ready.ok) throw new Error(`/ready returned ${ready.status}`);
  const readyBody = await ready.json();
  if (readyBody.status !== "ready" || readyBody.sourceQuality !== "community-api-derived" || !readyBody.dataDate || !Number.isInteger(readyBody.historyLength)) throw new Error("invalid readiness response");
  console.log(JSON.stringify({ health: healthBody, ready: readyBody }, null, 2));
} finally { child.kill(); }
