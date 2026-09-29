export type Status = "passed" | "failed" | "errored" | "skipped";

export interface Run {
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

export interface TestCase {
  suite: string;
  classname: string;
  name: string;
  status: Status;
  duration_ms: number;
  failure_message: string | null;
}

export interface Summary {
  projects: ({ project: string; runs: number; last_run: string; last_run_id: string } & Pick<
    Run,
    "total" | "passed" | "failed" | "errored" | "skipped"
  >)[];
  trend: Pick<Run, "id" | "project" | "started_at" | "total" | "passed" | "failed" | "errored" | "skipped">[];
  slowest: { suite: string; name: string; avg_ms: number; samples: number }[];
  flaky: { suite: string; name: string; failures: number; samples: number }[];
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : "";
};

export const api = {
  summary: (project?: string, signal?: AbortSignal) => get<Summary>(`/api/summary${qs({ project })}`, signal),
  runs: (project?: string, signal?: AbortSignal) =>
    get<{ runs: Run[] }>(`/api/runs${qs({ project, limit: "50" })}`, signal).then((r) => r.runs),
  run: (id: string, signal?: AbortSignal) =>
    get<Run & { cases: TestCase[] }>(`/api/runs/${encodeURIComponent(id)}`, signal),
};

export const passRate = (r: Pick<Run, "total" | "passed" | "skipped">) => {
  const executed = r.total - r.skipped;
  return executed > 0 ? r.passed / executed : 0;
};

export const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const formatPct = (x: number) => `${(x * 100).toFixed(x === 1 ? 0 : 1)}%`;
