import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import type pg from "pg";
import { runsRouter } from "./routes/runs.js";

export interface AppDeps {
  pool: pg.Pool;
  ingestToken: string;
  staticDir?: string;
}

export function createApp({ pool, ingestToken, staticDir }: AppDeps) {
  const app = express();

  app.get("/healthz", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });

  app.use("/api", runsRouter(pool, ingestToken));
  app.use("/api", (_req, res) => void res.status(404).json({ error: "not found" }));

  if (staticDir) {
    app.use(express.static(staticDir));
    // Client-side routing: serve the SPA shell for any other GET.
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.message });
  };
  app.use(onError);

  return app;
}
