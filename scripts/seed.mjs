#!/usr/bin/env node
// Loads three weeks of demo history built from this repo's real pipeline results.
//
// samples/pipeline/<phase>/ holds the actual unit-test, ZAP and Trivy output (as JUnit) for
// three commits, captured with scripts/scan-commit.sh:
//   1-baseline  the first version, before any security fixes
//   2-hardened  after fixing the ZAP and Trivy findings
//   3-current   today's main
// Each phase is replayed as a run per day with jittered durations, so the dashboard shows
// the real before-and-after rather than invented results.
//
// Usage: INGEST_TOKEN=... [BASE_URL=http://localhost:8080] node scripts/seed.mjs
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.BASE_URL ?? "http://localhost:8080";
const token = process.env.INGEST_TOKEN ?? readEnvFile().INGEST_TOKEN;
if (!token) throw new Error("Set INGEST_TOKEN (or create .env from .env.example)");

function readEnvFile() {
  try {
    return Object.fromEntries(
      readFileSync(".env", "utf8")
        .split("\n")
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
  } catch {
    return {};
  }
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../samples/pipeline");
// Days each phase covers, oldest first: 21 days in total.
const PHASE_DAYS = { "1-baseline": 6, "2-hardened": 5, "3-current": 10 };
const hex = () => [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Put the run at `when` and scale every duration by a small random factor.
function retime(xml, when) {
  const jitter = () => 0.8 + Math.random() * 0.4;
  return xml
    .replace(/ timestamp="[^"]*"/g, "")
    .replace(/<testsuites\b/, `<testsuites timestamp="${when.toISOString()}"`)
    .replace(/ time="([\d.]+)"/g, (_, t) => ` time="${(Number(t) * jitter()).toFixed(3)}"`);
}

let day = Object.values(PHASE_DAYS).reduce((a, b) => a + b, 0);
let uploaded = 0;
for (const [phase, days] of Object.entries(PHASE_DAYS)) {
  const dir = path.join(root, phase);
  const files = readdirSync(dir).filter((f) => f.endsWith(".xml"));
  for (let d = 0; d < days; d++, day--) {
    const commit = hex();
    for (const [i, file] of files.entries()) {
      const when = new Date(Date.now() - (day - 1) * 86_400_000 - (files.length - i) * 90_000);
      const project = file.replace(/\.xml$/, "");
      const body = retime(readFileSync(path.join(dir, file), "utf8"), when);
      let res;
      for (;;) {
        res = await fetch(`${base}/api/runs?project=${project}&branch=main&commit=${commit}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/xml" },
          body,
        });
        if (res.status !== 429) break;
        const wait = Number(res.headers.get("retry-after") ?? 10);
        console.log(`Upload rate limit reached; waiting ${wait}s (raise RATE_LIMIT_UPLOADS_PER_MIN to skip this)`);
        await new Promise((r) => setTimeout(r, wait * 1000));
      }
      if (!res.ok) throw new Error(`Upload of ${phase}/${file} failed: ${res.status} ${await res.text()}`);
      uploaded++;
    }
  }
}
console.log(`Seeded ${uploaded} runs from samples/pipeline`);
