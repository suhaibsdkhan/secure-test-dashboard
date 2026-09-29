import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type pg from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

// These checks mirror the OWASP ZAP findings fixed in docs/security-findings.md, so a regression
// fails the unit tests before it ever reaches the scan. No database needed.
const TOKEN = "s".repeat(40);
const staticDir = mkdtempSync(path.join(tmpdir(), "web-"));
writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><div id=root></div>");

const failingPool = { query: vi.fn().mockRejectedValue(new Error('relation "secret_table" does not exist')) } as unknown as pg.Pool;
const app = createApp({ pool: failingPool, ingestToken: TOKEN, staticDir });

describe("security headers", () => {
  it("sets CSP, anti-framing, nosniff and hides the framework", async () => {
    const res = await request(app).get("/").set("Accept", "text/html").expect(200);
    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("applies headers to API responses too", async () => {
    const res = await request(app).get("/api/nope").expect(404);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("routing", () => {
  it("serves the SPA shell only for HTML navigations", async () => {
    await request(app).get("/runs/abc").set("Accept", "text/html").expect(200).expect("Content-Type", /html/);
    await request(app).get("/sitemap.xml").expect(404).expect("Content-Type", /json/);
    await request(app).get("/7191465937231483843").set("Accept", "*/*").expect(404);
    await request(app).get("/latest/meta-data/").set("Accept", "application/json").expect(404);
    await request(app).post("/latest/meta-data/").expect(404).expect("Content-Type", /json/);
  });

  it("serves a real robots.txt", async () => {
    await request(app).get("/robots.txt").expect(200).expect("Content-Type", /text\/plain/);
  });
});

describe("error handling", () => {
  it("does not leak internal error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(app).get("/api/summary").expect(500);
    expect(res.body).toEqual({ error: "internal error" });
    expect(JSON.stringify(res.body)).not.toContain("secret_table");
  });
});

describe("rate limiting", () => {
  it("limits uploads per client", async () => {
    const limited = createApp({ pool: failingPool, ingestToken: TOKEN });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await request(limited).post("/api/runs?project=x").set("Authorization", "Bearer guess")).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses[30]).toBe(429);
    const res = await request(limited).post("/api/runs?project=x");
    expect(res.body).toEqual({ error: "too many requests" });
  });
});
