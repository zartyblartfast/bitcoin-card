import { describe, it, expect } from "vitest";
import { CurrencySchema, FeeRangeSchema } from "../src/types.js";

describe("types", () => {
  it("accepts valid currency", () => {
    expect(CurrencySchema.parse("USD")).toBe("USD");
  });

  it("rejects invalid currency", () => {
    expect(() => CurrencySchema.parse("XYZ")).toThrow();
  });

  it("accepts valid fee range", () => {
    expect(FeeRangeSchema.parse("1w")).toBe("1w");
  });

  it("rejects invalid fee range", () => {
    expect(() => FeeRangeSchema.parse("5y")).toThrow();
  });
});
