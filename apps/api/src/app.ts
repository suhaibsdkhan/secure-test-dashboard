import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type pg from "pg";
import { runsRouter } from "./routes/runs.js";

export interface AppDeps {
  pool: pg.Pool;
  ingestToken: string;
  staticDir?: string;
  /** Number of reverse proxies in front of the app (1 behind the ALB), so rate limits key on the real client IP. */
  trustProxy?: number;
  /** Per-IP requests per minute for API reads and for uploads. */
  readLimitPerMinute?: number;
  ingestLimitPerMinute?: number;
}

export function createApp({
  pool,
  ingestToken,
  staticDir,
  trustProxy = 0,
  readLimitPerMinute = 300,
  ingestLimitPerMinute = 30,
}: AppDeps) {
  const app = express();
  // ZAP 10037: don't advertise the framework.
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);

  // ZAP 10038 / 10020 / 10021: strict CSP, anti-framing and nosniff on every response.
  // The React bundle needs nothing inline, so no 'unsafe-inline' anywhere.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: "deny" },
      crossOriginEmbedderPolicy: true,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use((_req, res, next) => {
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    next();
  });

  app.get("/healthz", async (_req, res) => {
    await pool.query("SELECT 1");
    res.set("Cache-Control", "no-store").json({ status: "ok" });
  });

  const readLimiter = rateLimit({
    windowMs: 60_000,
    limit: readLimitPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "too many requests" },
  });
  app.use("/api", readLimiter, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", runsRouter(pool, ingestToken, ingestLimitPerMinute));
  app.use("/api", (_req, res) => void res.status(404).json({ error: "not found" }));

  if (staticDir) {
    app.get("/robots.txt", (_req, res) => void res.type("text/plain").send("User-agent: *\nDisallow: /\n"));
    app.use(express.static(staticDir, { index: false, maxAge: "1y", immutable: true }));
    // ZAP 100001: serve the SPA shell only for the client-side routes that exist. Any other
    // path is a real 404, not a 200 with index.html (a "soft 404" that confuses scanners and caches).
    app.get(["/", "/runs/:id"], (req, res, next) => {
      if (!req.accepts("html")) return next();
      res.set("Cache-Control", "no-cache").sendFile(path.join(staticDir, "index.html"));
    });
  }

  app.use((_req, res) => void res.status(404).json({ error: "not found" }));

  // Never echo internal error messages (SQL, stack traces) to clients.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? "internal error" : (err.expose && err.message) || "bad request" });
  };
  app.use(onError);

  return app;
}
