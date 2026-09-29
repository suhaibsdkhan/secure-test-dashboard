import { useState } from "react";
import { useNavigate } from "react-router";
import { formatDate, formatPct, passRate, type Status, type Summary } from "../api";

type Point = Summary["trend"][number];

const SERIES: { key: Status; label: string }[] = [
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed" },
  { key: "errored", label: "Errored" },
  { key: "skipped", label: "Skipped" },
];

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };
const GAP = 2;

/** Stacked bars: one bar per run, segments by outcome. Click a bar to open the run. */
export function TrendChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const navigate = useNavigate();
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.total), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / points.length;
  const barW = Math.max(4, Math.min(28, slot * 0.6));
  const y = (v: number) => (v / max) * innerH;
  const ticks = [0, Math.round(max / 2), max];
  const active = hover != null ? points[hover] : undefined;

  return (
    <figure className="chart">
      <div className="legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i className={`swatch fill-${s.key}`} /> {s.label}
          </span>
        ))}
      </div>
      <div className="chart-frame">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Test outcomes for the last ${points.length} runs`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH - y(t)} y2={PAD.top + innerH - y(t)} />
              <text className="tick" x={PAD.left - 6} y={PAD.top + innerH - y(t)} dy="0.32em" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            let base = PAD.top + innerH;
            const segs = SERIES.filter((s) => p[s.key] > 0);
            return (
              <g key={p.id} className={hover != null && hover !== i ? "dim" : undefined}>
                {segs.map((s, j) => {
                  const h = Math.max(y(p[s.key]) - (j < segs.length - 1 ? GAP : 0), 1);
                  base -= y(p[s.key]);
                  const top = j === segs.length - 1;
                  return (
                    <path
                      key={s.key}
                      className={`fill-${s.key}`}
                      d={barPath(cx - barW / 2, base + (j < segs.length - 1 ? GAP : 0), barW, h, top ? 4 : 0)}
                    />
                  );
                })}
                <rect
                  className="hit"
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  tabIndex={0}
                  role="link"
                  aria-label={`${formatDate(p.started_at)}: ${p.passed} passed, ${p.failed} failed, ${p.errored} errored, ${p.skipped} skipped`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => navigate(`/runs/${p.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/runs/${p.id}`)}
                />
              </g>
            );
          })}
          <line className="baseline" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} />
          {points.length > 0 && (
            <>
              <text className="tick" x={PAD.left} y={H - 8}>
                {formatDate(points[0]!.started_at)}
              </text>
              <text className="tick" x={W - PAD.right} y={H - 8} textAnchor="end">
                {formatDate(points[points.length - 1]!.started_at)}
              </text>
            </>
          )}
        </svg>
        {active && hover != null && (
          <div
            className="tooltip"
            style={{ left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%` }}
            role="status"
          >
            <strong>{formatDate(active.started_at)}</strong>
            <span className="muted">{active.project}</span>
            {SERIES.map((s) => (
              <span key={s.key} className="tt-row">
                <i className={`swatch fill-${s.key}`} /> {s.label}
                <b>{active[s.key]}</b>
              </span>
            ))}
            <span className="tt-row">
              Pass rate <b>{formatPct(passRate(active))}</b>
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}

/** Rect with only the top corners rounded (data end), anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
