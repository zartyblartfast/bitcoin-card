import { spawn } from "node:child_process";

const PORT = 8791;
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
  const res = await fetch(`http://127.0.0.1:${PORT}/api/bmri-comparison`);
  if (!res.ok) throw new Error(`/api/bmri-comparison returned ${res.status}`);
  const data = await res.json();
  if (!data.latest || typeof data.latest.fullIndex !== "number") throw new Error("missing latest.fullIndex");
  if (!Array.isArray(data.history) || data.history.length < 3000) throw new Error(`missing long history: ${data.history?.length}`);
  console.log(JSON.stringify({ latest: data.latest, history: data.history.length }, null, 2));
} finally {
  child.kill();
}
