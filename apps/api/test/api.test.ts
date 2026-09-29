import { readFileSync } from "node:fs";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";

const TOKEN = "t".repeat(40);
const databaseUrl = process.env.TEST_DATABASE_URL;
// Timestamps are stripped so runs land at now(), in upload order, inside the 30-day windows.
const sample = (name: string) =>
  readFileSync(new URL(`../../../samples/${name}`, import.meta.url), "utf8").replace(/ timestamp="[^"]*"/g, "");

describe.skipIf(!databaseUrl)("API (requires TEST_DATABASE_URL)", () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(pool);
    app = createApp({ pool, ingestToken: TOKEN });
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE test_runs CASCADE");
  });
  afterAll(async () => {
    await pool?.end();
  });

  const upload = (xml: string, query = "project=shop-ui&branch=main&commit=abc1234") =>
    request(app)
      .post(`/api/runs?${query}`)
      .set("Authorization", `Bearer ${TOKEN}`)
      .set("Content-Type", "application/xml")
      .send(xml);

  it("reports healthy", async () => {
    await request(app).get("/healthz").expect(200, { status: "ok" });
  });

  it("ingests a JUnit report and serves it back", async () => {
    const created = await upload(sample("pytest-run-fail.xml")).expect(201);
    expect(created.body).toMatchObject({ project: "shop-ui", total: 7, passed: 4, failed: 1, errored: 1, skipped: 1 });

    const list = await request(app).get("/api/runs?project=shop-ui").expect(200);
    expect(list.body.runs).toHaveLength(1);

    const detail = await request(app).get(`/api/runs/${created.body.id}`).expect(200);
    expect(detail.body.cases).toHaveLength(7);
    expect(detail.body.cases[0].status).toBe("failed");
  });

  it("builds a summary with trend and flaky tests", async () => {
    await upload(sample("pytest-run-pass.xml")).expect(201);
    await upload(sample("pytest-run-fail.xml")).expect(201);
    let { body } = await request(app).get("/api/summary").expect(200);
    expect(body.projects).toEqual([expect.objectContaining({ project: "shop-ui", runs: 2 })]);
    expect(body.trend).toHaveLength(2);
    // A single pass -> fail flip is a regression, not flakiness.
    expect(body.flaky).toEqual([]);

    await upload(sample("pytest-run-pass.xml")).expect(201);
    ({ body } = await request(app).get("/api/summary").expect(200));
    expect(body.flaky.map((f: { name: string }) => f.name).sort()).toEqual([
      "test_checkout_with_saved_card",
      "test_invalid_password_shows_error",
    ]);
  });

  it("requires the ingest token", async () => {
    await request(app).post("/api/runs?project=x").set("Content-Type", "application/xml").send("<a/>").expect(401);
    await request(app)
      .post("/api/runs?project=x")
      .set("Authorization", "Bearer wrong")
      .set("Content-Type", "application/xml")
      .send("<a/>")
      .expect(401);
  });

  it("validates input", async () => {
    await upload(sample("pytest-run-pass.xml"), "project=bad%20name").expect(400);
    await upload(sample("pytest-run-pass.xml"), "project=x&commit=not-a-sha").expect(400);
    await upload("<html/>").expect(422);
    await request(app).get("/api/runs/not-a-uuid").expect(404);
    await request(app).get("/api/runs?limit=1000").expect(400);
  });
});
