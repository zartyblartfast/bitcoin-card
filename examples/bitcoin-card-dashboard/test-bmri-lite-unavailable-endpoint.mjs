import { spawn } from "node:child_process";

const PORT = 8796;
const preload = new URL("./test-bmri-lite-upstream-failure-preload.mjs", import.meta.url).pathname;
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: String(PORT), NODE_OPTIONS: `--import=${preload}` },
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
  const response = await fetch(`http://127.0.0.1:${PORT}/api/bmri-lite`);
  if (response.status !== 503) throw new Error(`/api/bmri-lite returned ${response.status}, expected 503`);
  const body = await response.json();
  if (!/unavailable, stale, or invalid/i.test(body.error)) throw new Error(`unexpected error: ${body.error}`);
  console.log(JSON.stringify({ status: response.status, error: body.error }, null, 2));
} finally {
  child.kill();
}
