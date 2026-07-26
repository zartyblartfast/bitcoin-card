#!/usr/bin/env node
import { spawn } from "node:child_process";

const cliPath = process.argv[2] ?? new URL("../dist/cli.js", import.meta.url).pathname;
const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "bitcoin-card-mcp-smoke", version: "1.0.0" },
  },
};

const child = spawn(process.execPath, [cliPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
let settled = false;

function finish(exitCode, message) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  child.kill();
  process.stdout.write(`${message}\n`);
  process.exit(exitCode);
}

child.stdout.on("data", (chunk) => {
  stdout += chunk;
  const line = stdout.split("\n").find(Boolean);
  if (!line) return;

  try {
    const response = JSON.parse(line);
    if (response.id !== 1 || !response.result?.serverInfo) {
      finish(1, `MCP CLI returned an unexpected response: ${line}`);
      return;
    }
    if (response.result.serverInfo.name !== "bitcoin-card-mcp") {
      finish(1, `MCP CLI reported the wrong server name: ${response.result.serverInfo.name}`);
      return;
    }
    finish(0, `PASS: ${response.result.serverInfo.name}@${response.result.serverInfo.version} answered initialize.`);
  } catch {
    finish(1, `MCP CLI wrote invalid JSON to stdout: ${line}`);
  }
});

child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

child.on("error", (error) => {
  finish(1, `Could not start MCP CLI: ${error.message}`);
});

child.on("close", (code) => {
  if (!settled) {
    const detail = stderr.trim() || "no stderr";
    finish(1, `MCP CLI exited ${code} before answering initialize (${detail}).`);
  }
});

const timeout = setTimeout(() => {
  const detail = stderr.trim() || "no stderr";
  finish(1, `MCP CLI did not answer initialize within 5 seconds (${detail}).`);
}, 5_000);

setTimeout(() => {
  child.stdin.write(`${JSON.stringify(request)}\n`);
}, 100);
