import express, { Router } from "express";
import type pg from "pg";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireIngestToken } from "../lib/auth.js";
import { JUnitParseError, parseJUnit } from "../lib/junit.js";
import { getRun, getSummary, insertRun, listRuns } from "../db/runs.js";

const slug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._/-]+$/, "may contain letters, digits, '.', '_', '/', '-'");

const ingestQuery = z.object({
  project: slug,
  branch: slug.default("main"),
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/i, "must be a git SHA")
    .optional(),
});

const listQuery = z.object({
  project: slug.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

const summaryQuery = z.object({ project: slug.optional() });

export function runsRouter(pool: pg.Pool, ingestToken: string, ingestLimitPerMinute = 30): Router {
  const router = Router();

  router.get("/runs", async (req, res) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return void res.status(400).json({ error: "invalid query", details: z.flattenError(q.error) });
    res.json({ runs: await listRuns(pool, q.data) });
  });

  router.get("/runs/:id", async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) return void res.status(404).json({ error: "not found" });
    const run = await getRun(pool, id.data);
    if (!run) return void res.status(404).json({ error: "not found" });
    res.json(run);
  });

  router.get("/summary", async (req, res) => {
    const q = summaryQuery.safeParse(req.query);
    if (!q.success) return void res.status(400).json({ error: "invalid query", details: z.flattenError(q.error) });
    res.json(await getSummary(pool, q.data.project));
  });

  // Uploads come from a handful of CI jobs; a tight limit also slows token guessing.
  const ingestLimiter = rateLimit({
    windowMs: 60_000,
    limit: ingestLimitPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "too many requests" },
  });

  router.post(
    "/runs",
    ingestLimiter,
    requireIngestToken(ingestToken),
    express.text({ type: ["application/xml", "text/xml"], limit: "5mb" }),
    async (req, res) => {
      const q = ingestQuery.safeParse(req.query);
      if (!q.success) return void res.status(400).json({ error: "invalid query", details: z.flattenError(q.error) });
      if (typeof req.body !== "string" || req.body.length === 0) {
        return void res.status(415).json({ error: "send a JUnit XML body with Content-Type: application/xml" });
      }
      try {
        const report = parseJUnit(req.body);
        const run = await insertRun(pool, { project: q.data.project, branch: q.data.branch, commitSha: q.data.commit ?? null }, report);
        res.status(201).location(`/api/runs/${run.id}`).json(run);
      } catch (err) {
        if (err instanceof JUnitParseError) return void res.status(422).json({ error: err.message });
        throw err;
      }
    },
  );

  return router;
}
