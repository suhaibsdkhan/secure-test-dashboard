import { useState } from "react";
import { Link, useParams } from "react-router";
import { api, formatDate, formatDuration, formatPct, passRate, type Status } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { useFetch } from "../useFetch";

const FILTERS: (Status | "all")[] = ["all", "failed", "errored", "skipped", "passed"];

export function RunDetail() {
  const { id = "" } = useParams();
  const { data: run, error } = useFetch((s) => api.run(id, s), id);
  const [filter, setFilter] = useState<Status | "all">("all");

  if (error) return <p className="error">Could not load run: {error}</p>;
  if (!run) return <p className="empty">Loading…</p>;

  const cases = filter === "all" ? run.cases : run.cases.filter((c) => c.status === filter);

  return (
    <>
      <p>
        <Link to={`/?project=${encodeURIComponent(run.project)}`}>← {run.project}</Link>
      </p>
      <div className="page-head">
        <h1>
          {run.suite_name} <span className="muted">· {formatDate(run.started_at)}</span>
        </h1>
      </div>
      <section className="tiles">
        <div className="tile">
          <span className="tile-label">Pass rate</span>
          <span className="tile-value">{formatPct(passRate(run))}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Tests</span>
          <span className="tile-value">{run.total}</span>
          <span className="tile-sub">
            {run.passed} passed · {run.failed} failed · {run.errored} errored · {run.skipped} skipped
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Duration</span>
          <span className="tile-value">{formatDuration(run.duration_ms)}</span>
          <span className="tile-sub mono">
            {run.branch}
            {run.commit_sha ? ` @ ${run.commit_sha.slice(0, 7)}` : ""}
          </span>
        </div>
      </section>

      <section className="card">
        <div className="seg" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <ul className="cases">
          {cases.map((c, i) => (
            <li key={`${c.suite}/${c.name}/${i}`}>
              <div className="case-head">
                <StatusBadge status={c.status} />
                <span className="mono case-name">{c.name}</span>
                <span className="muted num">{formatDuration(c.duration_ms)}</span>
              </div>
              <div className="muted small">{c.classname || c.suite}</div>
              {c.failure_message && <pre className="failure">{c.failure_message}</pre>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
