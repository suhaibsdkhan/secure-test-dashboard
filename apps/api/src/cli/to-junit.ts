// Usage:
//   tsx src/cli/to-junit.ts zap   <zap-console.log>  <suite-name>  > results.xml
//   tsx src/cli/to-junit.ts trivy <trivy.json>       <suite-name>  > results.xml
import { readFileSync } from "node:fs";
import { trivyJsonToJUnit, zapLogToJUnit } from "../lib/scan-junit.js";

const [kind, file, suite] = process.argv.slice(2);
if (!kind || !file || !suite || !["zap", "trivy"].includes(kind)) {
  console.error("usage: to-junit.ts <zap|trivy> <file> <suite-name>");
  process.exit(2);
}
const input = readFileSync(file, "utf8");
process.stdout.write(kind === "zap" ? zapLogToJUnit(input, suite) : trivyJsonToJUnit(input, suite));
