// Converts security scan output into JUnit XML so scans show up on the dashboard like any
// other test suite: each ZAP rule and each Trivy scan target is a test case, and every
// finding that would fail the pipeline is a failed test.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Case {
  classname: string;
  name: string;
  status: "passed" | "failed" | "skipped";
  message?: string;
  detail?: string;
}

function toXml(suite: string, cases: Case[], timestamp?: string): string {
  const failures = cases.filter((c) => c.status === "failed").length;
  const skipped = cases.filter((c) => c.status === "skipped").length;
  const body = cases
    .map((c) => {
      const open = `<testcase classname="${esc(c.classname)}" name="${esc(c.name)}" time="0"`;
      if (c.status === "passed") return `${open}/>`;
      const tag = c.status === "failed" ? "failure" : "skipped";
      return `${open}><${tag} message="${esc(c.message ?? "")}">${esc(c.detail ?? "")}</${tag}></testcase>`;
    })
    .join("\n    ");
  const ts = timestamp ? ` timestamp="${esc(timestamp)}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="${esc(suite)}">
  <testsuite name="${esc(suite)}" tests="${cases.length}" failures="${failures}" skipped="${skipped}"${ts}>
    ${body}
  </testsuite>
</testsuites>
`;
}

const ZAP_LINE = /^(PASS|WARN-NEW|WARN-INPROG|FAIL-NEW|FAIL-INPROG|IGNORE-NEW|IGNORE|INFO): (.+) \[(\d+)\](?: x (\d+))?\s*$/;

/** Parses the console output of zap-baseline.py / zap-api-scan.py. */
export function zapLogToJUnit(log: string, suite: string, timestamp?: string): string {
  const cases: Case[] = [];
  let current: Case | undefined;
  for (const raw of log.split(/\r?\n/)) {
    const line = raw.replace(/^\d{4}-\d{2}-\d{2}T\S+Z /, ""); // tolerate GitHub Actions timestamps
    const m = ZAP_LINE.exec(line);
    if (m) {
      const [, verdict, name, id, count] = m;
      const status = verdict!.startsWith("PASS") ? "passed" : /^(WARN|FAIL)/.test(verdict!) ? "failed" : "skipped";
      current = {
        classname: `zap.${id}`,
        name: `${name} [${id}]`,
        status,
        message: status === "passed" ? undefined : `${verdict}: ${count ?? 1} instance(s)`,
        detail: "",
      };
      cases.push(current);
    } else if (current && current.status !== "passed" && /^\s+https?:\/\//.test(line)) {
      current.detail += `${line.trim()}\n`;
    }
  }
  if (cases.length === 0) throw new Error("No ZAP rule results found in the log");
  return toXml(suite, cases, timestamp);
}

interface TrivyReport {
  CreatedAt?: string;
  Results?: {
    Target: string;
    Class?: string;
    Type?: string;
    Vulnerabilities?: {
      VulnerabilityID: string;
      PkgName: string;
      InstalledVersion: string;
      FixedVersion?: string;
      Severity: string;
      Title?: string;
    }[];
    Misconfigurations?: { ID: string; Title: string; Severity: string; Status: string; Message?: string }[];
    Secrets?: { RuleID: string; Title: string; Severity: string; StartLine?: number }[];
  }[];
}

/**
 * Parses `trivy ... --format json`. Every scanned target is a test case (passing when clean),
 * and every finding at or above `minSeverity` is a failed test case of its own.
 */
export function trivyJsonToJUnit(json: string, suite: string, minSeverity = "HIGH"): string {
  const order = ["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const gate = order.indexOf(minSeverity);
  const counts = (sev: string) => order.indexOf(sev) >= gate;
  const report = JSON.parse(json) as TrivyReport;
  const cases: Case[] = [];
  for (const r of report.Results ?? []) {
    const findings: Case[] = [];
    for (const v of r.Vulnerabilities ?? []) {
      if (!counts(v.Severity)) continue;
      findings.push({
        classname: r.Target,
        name: `${v.VulnerabilityID} in ${v.PkgName} ${v.InstalledVersion}`,
        status: "failed",
        message: `${v.Severity}: ${v.Title ?? v.VulnerabilityID}`,
        detail: v.FixedVersion ? `Fixed in ${v.FixedVersion}` : "No fix available",
      });
    }
    for (const m of r.Misconfigurations ?? []) {
      if (m.Status !== "FAIL" || !counts(m.Severity)) continue;
      findings.push({ classname: r.Target, name: `${m.ID}: ${m.Title}`, status: "failed", message: m.Severity, detail: m.Message });
    }
    for (const s of r.Secrets ?? []) {
      if (!counts(s.Severity)) continue;
      findings.push({ classname: r.Target, name: `Secret ${s.RuleID}`, status: "failed", message: `${s.Severity}: ${s.Title}` });
    }
    cases.push({ classname: r.Target, name: `${r.Target} has no ${minSeverity}+ findings`, status: findings.length ? "failed" : "passed", message: findings.length ? `${findings.length} finding(s)` : undefined });
    cases.push(...findings);
  }
  if (cases.length === 0) throw new Error("Trivy report has no results");
  return toXml(suite, cases, report.CreatedAt);
}
