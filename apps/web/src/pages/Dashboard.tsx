import { Link, useSearchParams } from "react-router";
import { api, formatDate, formatDuration, formatPct, passRate } from "../api";
import { TrendChart } from "../components/TrendChart";
import { useFetch } from "../useFetch";

export function Dashboard() {
  const [params, setParams] = useSearchParams();
  const project = params.get("project") ?? undefined;
  const summary = useFetch((s) => api.summary(project, s), `summary:${project ?? ""}`);
  const runs = useFetch((s) => api.runs(project, s), `runs:${project ?? ""}`);

  if (summary.error || runs.error) return <p className="error">Could not load results: {summary.error ?? runs.error}</p>;
  if (!summary.data || !runs.data) return <p className="empty">Loading…</p>;

  const { projects, trend, flaky, slowest } = summary.data;
  if (projects.length === 0) {
    return (
      <div className="empty">
        <h1>No test runs yet</h1>
        <p>
          Upload a JUnit XML report from your test suite's CI job — see <code>docs/ingest.md</code>.
        </p>
      </div>
    );
  }

  const latest = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  const rate = latest ? passRate(latest) : 0;
  const delta = latest && previous ? rate - passRate(previous) : null;
  const avgRate = trend.length ? trend.reduce((a, r) => a + passRate(r), 0) / trend.length : 0;

  return (
    <>
      <div className="page-head">
        <h1>{project ?? "All projects"}</h1>
        <label className="filter">
          Project
          <select
            value={project ?? ""}
            onChange={(e) => setParams(e.target.value ? { project: e.target.value } : {})}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.project} value={p.project}>
                {p.project}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="tiles">
        <div className="tile">
          <span className="tile-label">Latest pass rate</span>
          <span className="tile-value">{formatPct(rate)}</span>
          {delta != null && (
            <span className={delta < 0 ? "delta down" : "delta up"}>
              {delta < 0 ? "▼" : "▲"} {formatPct(Math.abs(delta))} vs previous run
            </span>
          )}
        </div>
        <div className="tile">
          <span className="tile-label">Failing in latest run</span>
          <span className="tile-value">{latest ? latest.failed + latest.errored : 0}</span>
          <span className="tile-sub">of {latest?.total ?? 0} tests</span>
        </div>
        <div className="tile">
          <span className="tile-label">Average pass rate</span>
          <span className="tile-value">{formatPct(avgRate)}</span>
          <span className="tile-sub">last {trend.length} runs</span>
        </div>
      </section>

      <section className="card">
        <h2>Outcomes per run</h2>
        <TrendChart points={trend} />
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Flaky tests</h2>
          <p className="hint">Passed and failed on the same branch in the last 30 days.</p>
          {flaky.length === 0 ? (
            <p className="muted">None detected.</p>
          ) : (
            <ul className="list">
              {flaky.map((f) => (
                <li key={`${f.suite}/${f.name}`}>
                  <span className="mono">{f.name}</span>
                  <span className="muted">
                    {f.failures}/{f.samples} failed
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Slowest tests</h2>
          <p className="hint">Average duration over the last 30 days.</p>
          <ul className="list">
            {slowest.map((s) => (
              <li key={`${s.suite}/${s.name}`}>
                <span className="mono">{s.name}</span>
                <span className="muted num">{formatDuration(s.avg_ms)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h2>Recent runs</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Project</th>
                <th>Branch</th>
                <th>Commit</th>
                <th className="num">Pass rate</th>
                <th className="num">Failed</th>
                <th className="num">Tests</th>
                <th className="num">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/runs/${r.id}`}>{formatDate(r.started_at)}</Link>
                  </td>
                  <td>{r.project}</td>
                  <td className="mono">{r.branch}</td>
                  <td className="mono">{r.commit_sha?.slice(0, 7) ?? "—"}</td>
                  <td className="num">{formatPct(passRate(r))}</td>
                  <td className={`num ${r.failed + r.errored > 0 ? "text-bad" : ""}`}>{r.failed + r.errored}</td>
                  <td className="num">{r.total}</td>
                  <td className="num">{formatDuration(r.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
