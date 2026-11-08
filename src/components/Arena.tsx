// Side-by-side animated views of the three controllers.
import { DEFAULT_PROFILE, RobotProfile } from "../sim/robot";
import RobotShape from "./field/RobotShape";

export interface ArenaRun {
  id: string;
  label: string;
  color: string;
  t: number[];
  h: number[]; // heading relative to start (deg)
  x?: number[]; // straight: forward mm
  y?: number[]; // straight: side drift mm
}

const at = (arr: number[], t: number[], time: number) => {
  if (!arr.length) return 0;
  let i = 0;
  while (i < t.length - 1 && t[i + 1] <= time) i++;
  return arr[i];
};

function arcPath(r: number, a0: number, a1: number) {
  const p = (a: number) => [r * Math.cos(((a - 90) * Math.PI) / 180), r * Math.sin(((a - 90) * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0},${y0} A${r},${r} 0 ${large} ${sweep} ${x1},${y1}`;
}

export function TurnArena({ runs, target, time, profile = DEFAULT_PROFILE }: { runs: ArenaRun[]; target: number; time: number; profile?: RobotProfile }) {
  const R = 150;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${runs.length}, minmax(0, 1fr))`, gap: 10 }}>
      {runs.map((r) => {
        const h = at(r.h, r.t, time);
        const err = h - target;
        return (
          <div key={r.id} className="card flat" style={{ padding: 10, background: "var(--surface-2)", minWidth: 0 }}>
            <div className="row small" style={{ gap: 7, fontWeight: 600, marginBottom: 4, minWidth: 0 }}>
              <span className="dot" style={{ background: r.color }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            </div>
            <svg viewBox={`${-R - 20} ${-R - 20} ${2 * R + 40} ${2 * R + 40}`} width="100%" role="img" aria-label={`${r.label}: ${h.toFixed(1)}°`}>
              <circle r={R} fill="none" stroke="var(--border)" strokeWidth="2" />
              {Array.from({ length: 24 }, (_, i) => {
                const a = (i * 15 * Math.PI) / 180;
                const l = i % 6 === 0 ? 16 : 8;
                return <line key={i} x1={(R - l) * Math.sin(a)} y1={-(R - l) * Math.cos(a)} x2={R * Math.sin(a)} y2={-R * Math.cos(a)} stroke="var(--border-strong)" strokeWidth="2" />;
              })}
              <path d={arcPath(R - 26, 0, target)} fill="none" stroke="var(--border-strong)" strokeWidth="8" strokeLinecap="round" opacity="0.6" />
              <path d={arcPath(R - 26, 0, Math.max(-359, Math.min(359, h)))} fill="none" stroke={r.color} strokeWidth="8" strokeLinecap="round" />
              <line x1="0" y1="0" x2={(R + 6) * Math.sin((target * Math.PI) / 180)} y2={-(R + 6) * Math.cos((target * Math.PI) / 180)} stroke="var(--ink)" strokeWidth="2.5" strokeDasharray="6 5" />
              <g transform="scale(0.62)">
                <RobotShape x={0} y={0} heading={h - 90} profile={profile} color={r.color} />
              </g>
            </svg>
            <div className="num" style={{ textAlign: "center", lineHeight: 1.2 }}>
              <strong>{h.toFixed(1)}°</strong>
              <div className="tiny muted">{Math.abs(err) < 0.05 ? "±0.0°" : `${err > 0 ? "+" : ""}${err.toFixed(1)}°`}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StraightArena({ runs, distance, time, exaggerate = 10, profile = DEFAULT_PROFILE }: { runs: ArenaRun[]; distance: number; time: number; exaggerate?: number; profile?: RobotProfile }) {
  const W = distance + 300;
  const laneH = 150;
  return (
    <div className="card flat" style={{ padding: 12, background: "var(--surface-2)" }}>
      <svg viewBox={`-150 0 ${W} ${laneH * runs.length}`} width="100%" role="img" aria-label="Straight driving lanes">
        {runs.map((r, i) => {
          const y0 = laneH * i + laneH / 2;
          const xs = r.x ?? [];
          const ys = r.y ?? [];
          let d = "";
          for (let k = 0; k < r.t.length && r.t[k] <= time; k += 2) d += (d ? "L" : "M") + xs[k].toFixed(1) + "," + (y0 + ys[k] * exaggerate).toFixed(1);
          const cx = at(xs, r.t, time);
          const cy = at(ys, r.t, time);
          const h = at(r.h, r.t, time);
          return (
            <g key={r.id}>
              <rect x={-150} y={laneH * i + 4} width={W} height={laneH - 8} rx="14" fill="var(--surface)" />
              <line x1={0} y1={y0} x2={distance} y2={y0} stroke="var(--border-strong)" strokeWidth="3" strokeDasharray="14 10" />
              <line x1={distance} y1={laneH * i + 14} x2={distance} y2={laneH * (i + 1) - 14} stroke="var(--ink)" strokeWidth="3" />
              <path d={d} fill="none" stroke={r.color} strokeWidth="6" strokeLinecap="round" />
              <g transform={`translate(${cx} ${y0 + cy * exaggerate}) scale(0.55)`}>
                <RobotShape x={0} y={0} heading={h * exaggerate * 0.3} profile={profile} color={r.color} />
              </g>
              <text x={-135} y={laneH * i + 34} fontSize="22" fontWeight="600" fill="var(--ink-2)">{r.label}</text>
              <text x={-135} y={laneH * (i + 1) - 18} fontSize="20" fill="var(--muted)" className="num">{cy >= 0 ? "+" : ""}{cy.toFixed(1)} mm</text>
            </g>
          );
        })}
      </svg>
      <div className="tiny muted" style={{ textAlign: "right" }}>↕ ×{exaggerate}</div>
    </div>
  );
}
