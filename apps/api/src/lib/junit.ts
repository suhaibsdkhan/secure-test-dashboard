import { XMLParser } from "fast-xml-parser";

export type CaseStatus = "passed" | "failed" | "errored" | "skipped";

export interface ParsedCase {
  suite: string;
  classname: string;
  name: string;
  status: CaseStatus;
  durationMs: number;
  failureMessage: string | null;
}

export interface ParsedReport {
  suiteName: string;
  startedAt: Date | null;
  durationMs: number;
  cases: ParsedCase[];
}

export class JUnitParseError extends Error {}

const MAX_CASES = 20_000;
const MAX_MESSAGE_CHARS = 4_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  // Only the XML built-ins (&lt; &amp; ...); DOCTYPE-declared entities are rejected before parsing.
  processEntities: true,
  htmlEntities: false,
  isArray: (tagName) => ["testsuite", "testcase", "failure", "error", "skipped"].includes(tagName),
});

type Node = Record<string, unknown>;

function asNode(value: unknown): Node {
  return value && typeof value === "object" ? (value as Node) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function seconds(value: unknown): number {
  const n = Number.parseFloat(str(value));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : 0;
}

function message(nodes: unknown): string | null {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const first = asNode(nodes[0]);
  const text = [str(first.message), str(first["#text"])].filter(Boolean).join("\n");
  return text ? text.slice(0, MAX_MESSAGE_CHARS) : null;
}

/**
 * Parses a JUnit XML report (the format emitted by pytest, Jest, Playwright, Selenium/TestNG,
 * Cypress and most CI tools) into a flat list of test cases.
 */
export function parseJUnit(xml: string): ParsedReport {
  // Refuse DTDs outright: they are never needed for JUnit reports and are the vector for
  // XXE and entity-expansion ("billion laughs") attacks.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new JUnitParseError("DOCTYPE and ENTITY declarations are not allowed");
  }

  let doc: Node;
  try {
    doc = asNode(parser.parse(xml, true));
  } catch (err) {
    throw new JUnitParseError(`Malformed XML: ${(err as Error).message}`);
  }

  let root: Node;
  let suites: Node[];
  if (doc.testsuites) {
    root = asNode(doc.testsuites);
    suites = ((root.testsuite as unknown[]) ?? []).map(asNode);
  } else if (doc.testsuite) {
    suites = (doc.testsuite as unknown[]).map(asNode);
    root = suites[0] ?? {};
  } else {
    throw new JUnitParseError("Expected a <testsuites> or <testsuite> root element");
  }

  // Suites can nest (e.g. Mocha); flatten them.
  const flat: Node[] = [];
  const stack = [...suites];
  while (stack.length) {
    const suite = stack.shift()!;
    flat.push(suite);
    for (const child of (suite.testsuite as unknown[]) ?? []) stack.push(asNode(child));
  }

  const cases: ParsedCase[] = [];
  let summedDuration = 0;
  for (const suite of flat) {
    const suiteName = str(suite.name) || "default";
    summedDuration += seconds(suite.time);
    for (const raw of (suite.testcase as unknown[]) ?? []) {
      if (cases.length >= MAX_CASES) throw new JUnitParseError(`Report exceeds ${MAX_CASES} test cases`);
      const tc = asNode(raw);
      let status: CaseStatus = "passed";
      let failureMessage: string | null = null;
      if (tc.failure) {
        status = "failed";
        failureMessage = message(tc.failure);
      } else if (tc.error) {
        status = "errored";
        failureMessage = message(tc.error);
      } else if (tc.skipped) {
        status = "skipped";
        failureMessage = message(tc.skipped);
      }
      cases.push({
        suite: suiteName,
        classname: str(tc.classname),
        name: str(tc.name) || "(unnamed)",
        status,
        durationMs: seconds(tc.time),
        failureMessage,
      });
    }
  }

  if (cases.length === 0) throw new JUnitParseError("Report contains no test cases");

  const timestamp = str(root.timestamp || suites[0]?.timestamp);
  const startedAt = timestamp ? new Date(timestamp) : null;

  return {
    suiteName: str(root.name) || str(suites[0]?.name) || "tests",
    startedAt: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
    durationMs: seconds(root.time) || summedDuration || cases.reduce((a, c) => a + c.durationMs, 0),
    cases,
  };
}
