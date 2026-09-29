import type pg from "pg";
import type { ParsedReport } from "../lib/junit.js";

export interface RunMeta {
  project: string;
  branch: string;
  commitSha: string | null;
}

export interface RunRow {
  id: string;
  project: string;
  branch: string;
  commit_sha: string | null;
  suite_name: string;
  started_at: string;
  duration_ms: number;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
}

const RUN_COLUMNS =
  "id, project, branch, commit_sha, suite_name, started_at, duration_ms, total, passed, failed, errored, skipped";

export async function insertRun(pool: pg.Pool, meta: RunMeta, report: ParsedReport): Promise<RunRow> {
  const counts = { passed: 0, failed: 0, errored: 0, skipped: 0 };
  for (const c of report.cases) counts[c.status]++;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<RunRow>(
      `INSERT INTO test_runs (project, branch, commit_sha, suite_name, started_at, duration_ms, total, passed, failed, errored, skipped)
       VALUES ($1, $2, $3, $4, COALESCE($5, now()), $6, $7, $8, $9, $10, $11)
       RETURNING ${RUN_COLUMNS}`,
      [
        meta.project,
        meta.branch,
        meta.commitSha,
        report.suiteName,
        report.startedAt,
        report.durationMs,
        report.cases.length,
        counts.passed,
        counts.failed,
        counts.errored,
        counts.skipped,
      ],
    );
    const run = rows[0]!;

    // Insert cases in batches with a single parameterised statement per batch.
    const BATCH = 500;
    for (let i = 0; i < report.cases.length; i += BATCH) {
      const slice = report.cases.slice(i, i + BATCH);
      const values: unknown[] = [];
      const tuples = slice.map((c, j) => {
        const b = j * 7;
        values.push(run.id, c.suite, c.classname, c.name, c.status, c.durationMs, c.failureMessage);
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`;
      });
      await client.query(
        `INSERT INTO test_cases (run_id, suite, classname, name, status, duration_ms, failure_message) VALUES ${tuples.join(", ")}`,
        values,
      );
    }
    await client.query("COMMIT");
    return run;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listRuns(
  pool: pg.Pool,
  opts: { project?: string; limit: number; offset: number },
): Promise<RunRow[]> {
  const { rows } = await pool.query<RunRow>(
    `SELECT ${RUN_COLUMNS} FROM test_runs
     WHERE ($1::text IS NULL OR project = $1)
     ORDER BY started_at DESC
     LIMIT $2 OFFSET $3`,
    [opts.project ?? null, opts.limit, opts.offset],
  );
  return rows;
}

export async function getRun(pool: pg.Pool, id: string) {
  const { rows } = await pool.query<RunRow>(`SELECT ${RUN_COLUMNS} FROM test_runs WHERE id = $1`, [id]);
  const run = rows[0];
  if (!run) return null;
  const cases = await pool.query(
    `SELECT suite, classname, name, status, duration_ms, failure_message FROM test_cases
     WHERE run_id = $1
     ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'errored' THEN 1 WHEN 'skipped' THEN 2 ELSE 3 END, suite, name`,
    [id],
  );
  return { ...run, cases: cases.rows };
}

export async function getSummary(pool: pg.Pool, project?: string) {
  const projects = await pool.query<{ project: string; runs: number; last_run: string }>(
    `SELECT project, count(*)::int AS runs, max(started_at) AS last_run
     FROM test_runs GROUP BY project ORDER BY last_run DESC`,
  );
  const trend = await pool.query(
    `SELECT id, project, started_at, total, passed, failed, errored, skipped FROM (
       SELECT * FROM test_runs WHERE ($1::text IS NULL OR project = $1) ORDER BY started_at DESC LIMIT 30
     ) recent ORDER BY started_at ASC`,
    [project ?? null],
  );
  const slowest = await pool.query(
    `SELECT c.suite, c.name, round(avg(c.duration_ms))::int AS avg_ms, count(*)::int AS samples
     FROM test_cases c JOIN test_runs r ON r.id = c.run_id
     WHERE ($1::text IS NULL OR r.project = $1) AND r.started_at > now() - interval '30 days'
     GROUP BY c.suite, c.name ORDER BY avg_ms DESC LIMIT 5`,
    [project ?? null],
  );
  // Flaky = both passed and failed on the same branch within the last 30 days.
  const flaky = await pool.query(
    `SELECT c.suite, c.name,
            count(*) FILTER (WHERE c.status IN ('failed','errored'))::int AS failures,
            count(*)::int AS samples
     FROM test_cases c JOIN test_runs r ON r.id = c.run_id
     WHERE ($1::text IS NULL OR r.project = $1) AND r.started_at > now() - interval '30 days'
     GROUP BY c.suite, c.name, r.branch
     HAVING count(*) FILTER (WHERE c.status = 'passed') > 0
        AND count(*) FILTER (WHERE c.status IN ('failed','errored')) > 0
     ORDER BY failures DESC LIMIT 5`,
    [project ?? null],
  );
  return { projects: projects.rows, trend: trend.rows, slowest: slowest.rows, flaky: flaky.rows };
}
