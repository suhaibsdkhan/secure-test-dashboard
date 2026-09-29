import { readFileSync } from "node:fs";
import pg from "pg";
import type { Config } from "../config.js";

export function createPool(config: Config): pg.Pool {
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    host: config.PGHOST,
    port: config.PGPORT,
    user: config.PGUSER,
    password: config.PGPASSWORD,
    database: config.PGDATABASE,
    // RDS presents a certificate signed by the AWS RDS CA; the image bundles that CA (see Dockerfile).
    ssl:
      config.PGSSLMODE === "require"
        ? { rejectUnauthorized: true, ca: config.PGSSLROOTCERT ? readFileSync(config.PGSSLROOTCERT, "utf8") : undefined }
        : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}
