import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Bearer-token check for CI uploads. Compares SHA-256 digests in constant time. */
export function requireIngestToken(token: string): RequestHandler {
  const expected = digest(token);
  return (req, res, next) => {
    const header = req.get("authorization") ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match || !timingSafeEqual(digest(match[1]!), expected)) {
      res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
