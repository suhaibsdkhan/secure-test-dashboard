import { describe, expect, it } from "vitest";
import { parseJUnit } from "../src/lib/junit.js";
import { trivyJsonToJUnit, zapLogToJUnit } from "../src/lib/scan-junit.js";

const zapLog = `Using the Automation Framework
Total of 7 URLs
PASS: Vulnerable JS Library (Powered by Retire.js) [10003]
PASS: Cookie No HttpOnly Flag [10010]
WARN-NEW: Content Security Policy (CSP) Header Not Set [10038] x 2
	http://127.0.0.1:8080 (200 OK)
	http://127.0.0.1:8080/robots.txt (200 OK)
2026-09-29T17:37:35.1304064Z IGNORE-NEW: Unexpected Content-Type was returned [100001] x 1
	http://127.0.0.1:8080 (200 OK)
FAIL-NEW: 0	FAIL-INPROG: 0	WARN-NEW: 1	WARN-INPROG: 0	INFO: 0	IGNORE: 1	PASS: 2`;

describe("zapLogToJUnit", () => {
  it("turns each ZAP rule into a test case the dashboard can ingest", () => {
    const report = parseJUnit(zapLogToJUnit(zapLog, "zap-baseline"));
    expect(report.suiteName).toBe("zap-baseline");
    expect(report.cases.map((c) => [c.name, c.status])).toEqual([
      ["Vulnerable JS Library (Powered by Retire.js) [10003]", "passed"],
      ["Cookie No HttpOnly Flag [10010]", "passed"],
      ["Content Security Policy (CSP) Header Not Set [10038]", "failed"],
      ["Unexpected Content-Type was returned [100001]", "skipped"],
    ]);
    const csp = report.cases[2]!;
    expect(csp.failureMessage).toContain("WARN-NEW: 2 instance(s)");
    expect(csp.failureMessage).toContain("http://127.0.0.1:8080/robots.txt");
  });

  it("rejects output with no rule results", () => {
    expect(() => zapLogToJUnit("ERROR could not connect", "zap")).toThrow(/No ZAP rule results/);
  });
});

describe("trivyJsonToJUnit", () => {
  const trivy = JSON.stringify({
    CreatedAt: "2026-09-29T16:55:00Z",
    Results: [
      {
        Target: "app (debian 12.13)",
        Vulnerabilities: [
          { VulnerabilityID: "CVE-2026-31789", PkgName: "libssl3", InstalledVersion: "3.0.18", FixedVersion: "3.0.19", Severity: "CRITICAL", Title: "heap overflow" },
          { VulnerabilityID: "CVE-2026-0001", PkgName: "zlib", InstalledVersion: "1.2", Severity: "LOW" },
        ],
      },
      { Target: "package-lock.json" },
    ],
  });

  it("makes clean targets pass and each high/critical finding fail", () => {
    const report = parseJUnit(trivyJsonToJUnit(trivy, "trivy-image"));
    expect(report.startedAt?.toISOString()).toBe("2026-09-29T16:55:00.000Z");
    expect(report.cases.map((c) => [c.name, c.status])).toEqual([
      ["app (debian 12.13) has no HIGH+ findings", "failed"],
      ["CVE-2026-31789 in libssl3 3.0.18", "failed"],
      ["package-lock.json has no HIGH+ findings", "passed"],
    ]);
    expect(report.cases[1]!.failureMessage).toContain("Fixed in 3.0.19");
  });
});
