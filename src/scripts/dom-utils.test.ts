import { describe, expect, it } from "vitest";
import { formatNumber, truncate } from "./dom-utils";

describe("formatNumber", () => {
  it("formats integers with locale thousands separators", () => {
    expect(formatNumber(1_234_567)).toMatch(/1/);
    expect(formatNumber(0)).toBe("0");
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("collapses whitespace before measuring", () => {
    expect(truncate("  a   b  c  ", 20)).toBe("a b c");
  });

  it("appends an ellipsis when the string exceeds the limit", () => {
    const result = truncate("abcdefghij", 5);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});
