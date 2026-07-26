import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("CLI entrypoint", () => {
  it("answers an MCP initialize request through the built package CLI", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, ["scripts/smoke-cli.mjs"], {
      timeout: 10_000,
    });

    expect(stderr).toBe("");
    expect(stdout).toBe("PASS: bitcoin-card-mcp@0.1.5 answered initialize.\n");
  });
});
