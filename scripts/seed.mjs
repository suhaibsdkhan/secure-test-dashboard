#!/usr/bin/env node
// Uploads synthetic JUnit reports so the dashboard has history to show.
// Usage: INGEST_TOKEN=... [BASE_URL=http://localhost:8080] node scripts/seed.mjs
import { readFileSync } from "node:fs";

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

const tests = [
  ["tests.test_login", "test_valid_login_redirects_to_dashboard", 4.1, 0.0],
  ["tests.test_login", "test_invalid_password_shows_error", 3.9, 0.25],
  ["tests.test_login", "test_locked_account_message", 4.2, 0.0],
  ["tests.test_search", "test_search_returns_results", 2.8, 0.0],
  ["tests.test_search", "test_search_filters_by_price", 5.6, 0.05],
  ["tests.test_checkout", "test_add_item_to_cart", 6.1, 0.0],
  ["tests.test_checkout", "test_apply_discount_code", 7.8, 0.1],
  ["tests.test_checkout", "test_checkout_with_saved_card", 16.4, 0.2],
  ["tests.test_api", "test_get_products_returns_200", 0.4, 0.0],
  ["tests.test_api", "test_create_order_requires_auth", 0.6, 0.0],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const hex = () => [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("");

for (let day = 13; day >= 0; day--) {
  const started = new Date(Date.now() - day * 86_400_000 - 3_600_000);
  const cases = tests.map(([cls, name, time, failRate]) => {
    const t = (time * (0.85 + Math.random() * 0.3)).toFixed(3);
    if (Math.random() < failRate) {
      const err = name.includes("saved_card");
      const tag = err ? "error" : "failure";
      const msg = err ? "WebDriverException: chrome not reachable" : `AssertionError in ${name}`;
      return `<testcase classname="${cls}" name="${name}" time="${t}"><${tag} message="${esc(msg)}">${esc(msg)}</${tag}></testcase>`;
    }
    return `<testcase classname="${cls}" name="${name}" time="${t}"/>`;
  });
  cases.push(`<testcase classname="tests.test_checkout" name="test_paypal_checkout" time="0"><skipped message="sandbox unavailable"/></testcase>`);
  const xml = `<?xml version="1.0"?><testsuites name="ui-regression"><testsuite name="regression" timestamp="${started.toISOString()}">${cases.join("")}</testsuite></testsuites>`;
  const res = await fetch(`${base}/api/runs?project=shop-ui-tests&branch=main&commit=${hex()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/xml" },
    body: xml,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
}
console.log("Seeded 14 runs for project shop-ui-tests");
