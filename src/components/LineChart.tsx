// Small multi-series line chart (SVG). 2px lines, hairline grid, legend +
// end labels, and a crosshair tooltip listing every series at the hovered x.
import { useMemo, useRef, useState } from "react";

export interface Series {
  id: string;
  label: string;
  color: string; // CSS colour or var()
  x: number[];
  y: number[];
  dashed?: boolean;
}

interface Props {
  series: Series[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  yUnit?: string;
  refY?: { value: number; label: string };
  title?: string;
  formatY?: (v: number) => string;
  formatX?: (v: number) => string;
  yMin?: number;
  yMax?: number;
}

function niceTicks(min: number, max: number, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.001; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

export default function LineChart({ series, height = 240, xLabel, yUnit, refY, title, formatY, formatX, yMin, yMax }: Props) {
  const W = 640;
  const H = height;
  const m = { l: 48, r: 92, t: 12, b: 34 };
  const svgRef = useRef<SVGSVGElement>(null);
  const [hx, setHx] = useState<number | null>(null);

  const dom = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of series) {
      for (let i = 0; i < s.x.length; i++) {
        x0 = Math.min(x0, s.x[i]);
        x1 = Math.max(x1, s.x[i]);
        y0 = Math.min(y0, s.y[i]);
        y1 = Math.max(y1, s.y[i]);
      }
    }
    if (refY) {
      y0 = Math.min(y0, refY.value);
      y1 = Math.max(y1, refY.value);
    }
    if (!Number.isFinite(x0)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
    if (yMin !== undefined) y0 = yMin;
    if (yMax !== undefined) y1 = yMax;
    const pad = (y1 - y0) * 0.08 || 1;
    return { x0, x1: x1 === x0 ? x0 + 1 : x1, y0: y0 - pad, y1: y1 + pad };
  }, [series, refY, yMin, yMax]);

  const sx = (x: number) => m.l + ((x - dom.x0) / (dom.x1 - dom.x0)) * (W - m.l - m.r);
  const sy = (y: number) => m.t + (1 - (y - dom.y0) / (dom.y1 - dom.y0)) * (H - m.t - m.b);
  const yt = niceTicks(dom.y0, dom.y1, 5);
  const ystep = yt.length > 1 ? Math.abs(yt[1] - yt[0]) : 1;
  const ydec = Math.max(0, Math.min(3, -Math.floor(Math.log10(ystep) + 1e-9)));
  const ftick = (v: number) => v.toFixed(ydec);
  const xt = niceTicks(dom.x0, dom.x1, 6);
  const fy = formatY ?? ((v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)));
  const fx = formatX ?? ((v: number) => v.toFixed(0));

  const paths = series.map((s) => {
    let d = "";
    const step = Math.max(1, Math.floor(s.x.length / 600));
    for (let i = 0; i < s.x.length; i += step) d += (d ? "L" : "M") + sx(s.x[i]).toFixed(1) + "," + sy(s.y[i]).toFixed(1);
    return d;
  });

  // end labels: sort by y, skip if too close (legend still carries identity)
  const ends = series
    .map((s) => ({ s, y: s.y.length ? sy(s.y[s.y.length - 1]) : 0, v: s.y[s.y.length - 1] }))
    .sort((a, b) => a.y - b.y);
  const shown = new Set<string>();
  let lastY = -Infinity;
  for (const e of ends) {
    if (e.y - lastY >= 14) {
      shown.add(e.s.id);
      lastY = e.y;
    }
  }

  const nearest = (s: Series, x: number) => {
    let lo = 0, hi = s.x.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s.x[mid] < x) lo = mid;
      else hi = mid;
    }
    return Math.abs(s.x[lo] - x) < Math.abs(s.x[hi] - x) ? lo : hi;
  };

  const onMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const x = dom.x0 + ((px - m.l) / (W - m.l - m.r)) * (dom.x1 - dom.x0);
    setHx(Math.max(dom.x0, Math.min(dom.x1, x)));
  };

  const tip = hx === null ? null : series.map((s) => ({ s, v: s.y[nearest(s, hx)] }));
  const tipLeft = hx === null ? 0 : sx(hx) / W;

  return (
    <figure style={{ margin: 0, position: "relative" }}>
      {title && <figcaption className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{title}</figcaption>}
      {series.length > 1 && (
        <div className="row wrap" style={{ gap: 14, marginBottom: 6 }} aria-hidden>
          {series.map((s) => (
            <span key={s.id} className="row tiny" style={{ gap: 6, color: "var(--ink-2)" }}>
              <svg width="16" height="8"><line x1="1" y1="4" x2="15" y2="4" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={s.dashed ? "3 3" : undefined} /></svg>
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={title ?? "chart"}
        onPointerMove={onMove}
        onPointerLeave={() => setHx(null)}
        style={{ display: "block", touchAction: "none" }}
      >
        {yt.map((v) => (
          <g key={"y" + v}>
            <line x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={m.l - 8} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">{ftick(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={"x" + v} x={sx(v)} y={H - m.b + 16} textAnchor="middle" fontSize="11" fill="var(--muted)" className="num">{fx(v)}</text>
        ))}
        {xLabel && <text x={W - m.r} y={H - 4} textAnchor="end" fontSize="11" fill="var(--muted)">{xLabel}</text>}
        {yUnit && <text x={m.l - 8} y={m.t - 2} textAnchor="end" fontSize="10" fill="var(--muted)">{yUnit}</text>}
        {refY && (
          <g>
            <line x1={m.l} x2={W - m.r} y1={sy(refY.value)} y2={sy(refY.value)} stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />
            <text x={m.l + 4} y={sy(refY.value) - 5} fontSize="10.5" fill="var(--ink-2)">{refY.label}</text>
          </g>
        )}
        {series.map((s, i) => (
          <path key={s.id} d={paths[i]} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 4" : undefined} />
        ))}
        {series.map((s) =>
          s.y.length ? (
            <g key={"e" + s.id}>
              <circle cx={sx(s.x[s.x.length - 1])} cy={sy(s.y[s.y.length - 1])} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              {shown.has(s.id) && (
                <text x={sx(s.x[s.x.length - 1]) + 8} y={sy(s.y[s.y.length - 1]) + 4} fontSize="11" fill="var(--ink-2)">
                  {s.label} {fy(s.y[s.y.length - 1])}
                </text>
              )}
            </g>
          ) : null,
        )}
        {hx !== null && (
          <g pointerEvents="none">
            <line x1={sx(hx)} x2={sx(hx)} y1={m.t} y2={H - m.b} stroke="var(--ink-2)" strokeWidth="1" opacity="0.5" />
            {tip!.map(({ s, v }) => (
              <circle key={s.id} cx={sx(hx)} cy={sy(v)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {tip && (
        <div
          className="card"
          role="status"
          style={{
            position: "absolute",
            top: 30,
            left: `calc(${(tipLeft * 100).toFixed(1)}% + ${tipLeft > 0.6 ? -170 : 12}px)`,
            padding: "8px 10px",
            pointerEvents: "none",
            fontSize: 12.5,
            minWidth: 150,
            boxShadow: "var(--shadow-2)",
          }}
        >
          <div className="muted tiny" style={{ marginBottom: 4 }}>{fx(hx!)} {xLabel}</div>
          {tip.map(({ s, v }) => (
            <div key={s.id} className="row" style={{ gap: 8, justifyContent: "space-between" }}>
              <span className="row" style={{ gap: 6, color: "var(--ink-2)" }}>
                <svg width="12" height="6"><line x1="1" y1="3" x2="11" y2="3" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" /></svg>
                {s.label}
              </span>
              <strong className="num">{fy(v)}{yUnit ? ` ${yUnit}` : ""}</strong>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
