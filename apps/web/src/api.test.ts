import { formatDuration, formatPct, passRate } from "./api";

describe("formatting helpers", () => {
  it("excludes skipped tests from the pass rate", () => {
    expect(passRate({ total: 10, passed: 8, skipped: 2 })).toBe(1);
    expect(passRate({ total: 4, passed: 3, skipped: 0 })).toBe(0.75);
    expect(passRate({ total: 2, passed: 0, skipped: 2 })).toBe(0);
  });
  it("formats durations and percentages", () => {
    expect(formatDuration(250)).toBe("250 ms");
    expect(formatDuration(4210)).toBe("4.2 s");
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatPct(1)).toBe("100%");
    expect(formatPct(0.857)).toBe("85.7%");
  });
});
