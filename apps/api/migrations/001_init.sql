CREATE TABLE IF NOT EXISTS test_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project      text        NOT NULL,
  branch       text        NOT NULL DEFAULT 'main',
  commit_sha   text,
  suite_name   text        NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  duration_ms  integer     NOT NULL DEFAULT 0,
  total        integer     NOT NULL,
  passed       integer     NOT NULL,
  failed       integer     NOT NULL,
  errored      integer     NOT NULL,
  skipped      integer     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_runs_project_started_idx ON test_runs (project, started_at DESC);

CREATE TABLE IF NOT EXISTS test_cases (
  id              bigserial PRIMARY KEY,
  run_id          uuid    NOT NULL REFERENCES test_runs (id) ON DELETE CASCADE,
  suite           text    NOT NULL,
  classname       text    NOT NULL DEFAULT '',
  name            text    NOT NULL,
  status          text    NOT NULL CHECK (status IN ('passed', 'failed', 'errored', 'skipped')),
  duration_ms     integer NOT NULL DEFAULT 0,
  failure_message text
);

CREATE INDEX IF NOT EXISTS test_cases_run_idx ON test_cases (run_id);
