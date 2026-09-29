import type { Status } from "../api";

const ICON: Record<Status, string> = { passed: "✓", failed: "✕", errored: "!", skipped: "–" };

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span aria-hidden="true">{ICON[status]}</span> {status}
    </span>
  );
}
