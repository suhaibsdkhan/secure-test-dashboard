import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JUnitParseError, parseJUnit } from "../src/lib/junit.js";

const sample = (name: string) => readFileSync(new URL(`../../../samples/${name}`, import.meta.url), "utf8");

describe("parseJUnit", () => {
  it("parses a <testsuites> report with failures, errors and skips", () => {
    const report = parseJUnit(sample("pytest-run-fail.xml"));
    expect(report.suiteName).toBe("ui-regression");
    expect(report.durationMs).toBe(47093);
    expect(report.cases).toHaveLength(7);
    const byStatus = Object.groupBy(report.cases, (c) => c.status);
    expect(byStatus.passed).toHaveLength(4);
    expect(byStatus.failed?.[0]?.name).toBe("test_invalid_password_shows_error");
    expect(byStatus.failed?.[0]?.failureMessage).toContain("expected error banner");
    expect(byStatus.errored?.[0]?.failureMessage).toContain("chrome not reachable");
    expect(byStatus.skipped).toHaveLength(1);
  });

  it("accepts a single <testsuite> root", () => {
    const report = parseJUnit(
      `<testsuite name="jest" time="1.5" timestamp="2026-09-01T10:00:00Z"><testcase name="adds" time="0.01"/></testsuite>`,
    );
    expect(report.suiteName).toBe("jest");
    expect(report.startedAt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(report.cases).toEqual([
      { suite: "jest", classname: "", name: "adds", status: "passed", durationMs: 10, failureMessage: null },
    ]);
  });

  it("flattens nested suites", () => {
    const report = parseJUnit(
      `<testsuites><testsuite name="outer"><testsuite name="inner"><testcase name="a"/></testsuite><testcase name="b"/></testsuite></testsuites>`,
    );
    expect(report.cases.map((c) => `${c.suite}/${c.name}`).sort()).toEqual(["inner/a", "outer/b"]);
  });

  it("rejects DOCTYPE declarations (XXE / entity expansion)", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE t [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuite><testcase name="&x;"/></testsuite>`;
    expect(() => parseJUnit(xxe)).toThrow(JUnitParseError);
  });

  it("rejects documents that are not JUnit", () => {
    expect(() => parseJUnit("<html><body/></html>")).toThrow(/root element/);
    expect(() => parseJUnit("<testsuite name='x'></testsuite>")).toThrow(/no test cases/);
    expect(() => parseJUnit("<testsuite><testcase")).toThrow(JUnitParseError);
  });
});
