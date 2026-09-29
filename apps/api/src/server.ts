import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { migrate } from "./db/migrate.js";
import { createPool } from "./db/pool.js";

const config = loadConfig();
if (!config.INGEST_TOKEN) throw new Error("INGEST_TOKEN is required");

const pool = createPool(config);
const applied = await migrate(pool);
if (applied.length) console.log(`Applied migrations: ${applied.join(", ")}`);

const app = createApp({ pool, ingestToken: config.INGEST_TOKEN, staticDir: config.STATIC_DIR });
const server = app.listen(config.PORT, () => console.log(`API listening on :${config.PORT}`));

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end().then(() => process.exit(0)));
  });
}
