import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("CLI entrypoint", () => {
  it("starts the stdio server when the package bin is executed", () => {
    const source = readFileSync("src/index.ts", "utf8");

    expect(source).toMatch(/runStdio\s*\(\s*\)/);
  });
});
