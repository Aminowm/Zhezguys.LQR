// Interactive top view of the 2362 × 1143 mm FLL table.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MissionDef, TABLE_H, TABLE_W, WALL } from "../../field/bioglow";
import { segmentInfo } from "../../field/route";
import type { Pose } from "../../sim/physics";
import type { RobotProfile } from "../../sim/robot";
import type { CardMode, PlanItem, PlanTool, Program } from "../../storage/types";
import { MatLayer, MissionLayer } from "./MatLayer";
import RobotShape from "./RobotShape";

export interface RunView {
  programId: string;
  color: string;
  x: number[];
  y: number[];
  h: number[];
  idx: number;
}

export interface FieldHandle {
  zoom(f: number): void;
  fit(): void;
}

interface Props {
  mode: CardMode;
  grid: boolean;
  missions: MissionDef[];
  missionHighlight: Set<string>;
  items: PlanItem[];
  programs: Program[];
  activeProgramId: string | null;
  tool: PlanTool;
  color: string;
  width: number;
  selectedId: string | null;
  onSelect(id: string | null): void;
  onAdd(item: Omit<PlanItem, "id">): void;
  onChange(id: string, patch: Partial<PlanItem>, done: boolean): void;
  onDelete(id: string): void;
  onStartChange(programId: string, pose: Pose, done: boolean): void;
  onCursor(p: { x: number; y: number } | null): void;
  onTextRequest(at: { x: number; y: number; clientX: number; clientY: number }, existing?: PlanItem): void;
  profile: RobotProfile;
  runs: RunView[];
}

const PAD = WALL + 40;
const FULL = { x: -PAD, y: -PAD, w: TABLE_W + 2 * PAD, h: TABLE_H + 2 * PAD };

function arrowHead(x0: number, y0: number, x1: number, y1: number, size: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const p = (ang: number) => `${x1 - size * Math.cos(a + ang)},${y1 - size * Math.sin(a + ang)}`;
  return `${x1},${y1} ${p(0.45)} ${p(-0.45)}`;
}

function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0]},${pts[i][1]} ${mx},${my}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${l[0]},${l[1]}`;
}

const clampT = (x: number, y: number): [number, number] => [Math.max(0, Math.min(TABLE_W, x)), Math.max(0, Math.min(TABLE_H, y))];

const FieldView = forwardRef<FieldHandle, Props>(function FieldView(p, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(FULL);
  const [draft, setDraft] = useState<[number, number][] | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const drag = useRef<
    | null
    | { kind: "pan"; sx: number; sy: number; v: typeof FULL }
    | { kind: "draw" }
    | { kind: "move"; id: string; from: [number, number]; orig: [number, number][] }
    | { kind: "start"; programId: string; from: [number, number]; orig: Pose }
    | { kind: "rotate"; programId: string; orig: Pose }
    | { kind: "rotateItem"; id: string }
    | { kind: "erase" }
  >(null);
  const spaceDown = useRef(false);

  useImperativeHandle(ref, () => ({
    zoom(f: number) {
      setView((v) => {
        const w = Math.min(FULL.w * 1.2, Math.max(300, v.w / f));
        const h = (w * FULL.h) / FULL.w;
        const cx = v.x + v.w / 2;
        const cy = v.y + v.h / 2;
        return { x: cx - w / 2, y: cy - h / 2, w, h };
      });
    },
    fit() {
      setView(FULL);
    },
  }));

  const toMm = useCallback((clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const r = pt.matrixTransform(m.inverse());
    return [r.x, r.y];
  }, []);

  // wheel zoom around the cursor
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [mx, my] = toMm(e.clientX, e.clientY);
      const f = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const w = Math.min(FULL.w * 1.2, Math.max(300, v.w / f));
        const k = w / v.w;
        const h = v.h * k;
        return { x: mx - (mx - v.x) * k, y: my - (my - v.y) * k, w, h };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toMm]);

  // keyboard: finish/cancel route, delete selection, space-pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.code === "Space") spaceDown.current = true;
      if (p.tool === "path" && draft) {
        if (e.key === "Enter") finishPath();
        if (e.key === "Escape") setDraft(null);
        if (e.key === "Backspace") setDraft((d) => (d && d.length > 1 ? d.slice(0, -1) : null));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && p.selectedId) {
        p.onDelete(p.selectedId);
      }
      if (e.key === "Escape") p.onSelect(null);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  useEffect(() => {
    if (p.tool !== "path") setDraft(null);
  }, [p.tool]);

  const finishPath = () => {
    if (draft) {
      // drop the moving preview point and any double-clicked duplicates
      const pts: [number, number][] = [];
      for (const q of draft.slice(0, -1)) {
        const l = pts[pts.length - 1];
        if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 8) pts.push(q);
      }
      if (pts.length >= 2) p.onAdd({ kind: "path", programId: p.activeProgramId, color: p.color, width: p.width, points: pts });
    }
    setDraft(null);
  };

  /** Snap the first route point onto the active program's start position. */
  const snapStart = (pt: [number, number]): [number, number] => {
    const pr = p.programs.find((x) => x.id === p.activeProgramId);
    if (pr && Math.hypot(pr.start.x - pt[0], pr.start.y - pt[1]) < 120) return [pr.start.x, pr.start.y];
    return pt;
  };

  const visibleProgram = useMemo(() => {
    const m = new Map<string, Program>();
    for (const pr of p.programs) m.set(pr.id, pr);
    return m;
  }, [p.programs]);

  const itemVisible = (it: PlanItem) => !it.programId || visibleProgram.get(it.programId)?.visible !== false;

  // ───────── pointer handling on the background ─────────
  const onDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const [x, y] = toMm(e.clientX, e.clientY);
    const pan = e.button === 1 || spaceDown.current;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (pan || p.tool === "select") {
      if (!pan) p.onSelect(null);
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, v: view };
      return;
    }
    const pt = clampT(x, y);
    switch (p.tool) {
      case "pen":
      case "arrow":
      case "zone":
        drag.current = { kind: "draw" };
        setDraft([pt, pt]);
        break;
      case "path":
        setDraft((d) => (d ? [...d.slice(0, -1), pt, pt] : [snapStart(pt), pt]));
        break;
      case "text": {
        // open the text box after the browser finished its own focus handling
        const req = { x: pt[0], y: pt[1], clientX: e.clientX, clientY: e.clientY };
        e.preventDefault();
        window.setTimeout(() => p.onTextRequest(req), 0);
        break;
      }
      case "robot":
        p.onAdd({ kind: "robot", programId: p.activeProgramId, color: p.color, width: p.width, points: [pt], heading: 0 });
        break;
      case "eraser":
        drag.current = { kind: "erase" };
        break;
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const [x, y] = toMm(e.clientX, e.clientY);
    const inside = x >= 0 && y >= 0 && x <= TABLE_W && y <= TABLE_H;
    p.onCursor(inside ? { x, y } : null);
    setHover([x, y]);
    const d = drag.current;
    if (p.tool === "path" && draft && !d) {
      setDraft((dr) => (dr ? [...dr.slice(0, -1), clampT(x, y)] : dr));
    }
    if (!d) return;
    const svg = svgRef.current!;
    switch (d.kind) {
      case "pan": {
        const r = svg.getBoundingClientRect();
        const k = Math.max(d.v.w / r.width, d.v.h / r.height);
        setView({ ...d.v, x: d.v.x - (e.clientX - d.sx) * k, y: d.v.y - (e.clientY - d.sy) * k });
        break;
      }
      case "draw": {
        const pt = clampT(x, y);
        setDraft((dr) => {
          if (!dr) return dr;
          if (p.tool === "pen") {
            const l = dr[dr.length - 1];
            return Math.hypot(l[0] - pt[0], l[1] - pt[1]) > 6 ? [...dr, pt] : dr;
          }
          return [dr[0], pt];
        });
        break;
      }
      case "move": {
        const dx = x - d.from[0];
        const dy = y - d.from[1];
        p.onChange(d.id, { points: d.orig.map(([a, b]) => clampT(a + dx, b + dy)) }, false);
        break;
      }
      case "start": {
        const [nx, ny] = clampT(d.orig.x + x - d.from[0], d.orig.y + y - d.from[1]);
        p.onStartChange(d.programId, { ...d.orig, x: Math.round(nx / 5) * 5, y: Math.round(ny / 5) * 5 }, false);
        break;
      }
      case "rotate": {
        let a = (Math.atan2(y - d.orig.y, x - d.orig.x) * 180) / Math.PI;
        if (!e.shiftKey) a = Math.round(a / 5) * 5;
        p.onStartChange(d.programId, { ...d.orig, headingDeg: a }, false);
        break;
      }
      case "rotateItem": {
        const it = p.items.find((i) => i.id === d.id);
        if (!it) break;
        let a = (Math.atan2(y - it.points[0][1], x - it.points[0][0]) * 180) / Math.PI;
        if (!e.shiftKey) a = Math.round(a / 5) * 5;
        p.onChange(d.id, { heading: a }, false);
        break;
      }
      case "erase":
        break;
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "draw" && draft) {
      const [a, b] = [draft[0], draft[draft.length - 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (p.tool === "pen" && draft.length > 2) p.onAdd({ kind: "pen", programId: p.activeProgramId, color: p.color, width: p.width, points: draft });
      if (p.tool === "arrow" && len > 25) p.onAdd({ kind: "arrow", programId: p.activeProgramId, color: p.color, width: p.width, points: [a, b] });
      if (p.tool === "zone" && Math.abs(b[0] - a[0]) > 20 && Math.abs(b[1] - a[1]) > 20)
        p.onAdd({ kind: "zone", programId: p.activeProgramId, color: p.color, width: p.width, points: [a, b] });
      setDraft(null);
    }
    if (d.kind === "move") {
      const it = p.items.find((i) => i.id === d.id);
      if (it) p.onChange(d.id, { points: it.points }, true);
    }
    if (d.kind === "start" || d.kind === "rotate") {
      const pr = p.programs.find((x) => x.id === d.programId);
      if (pr) p.onStartChange(pr.id, pr.start, true);
    }
    if (d.kind === "rotateItem") {
      const it = p.items.find((i) => i.id === d.id);
      if (it) p.onChange(d.id, { heading: it.heading }, true);
    }
  };

  // ───────── pointer handling on items ─────────
  const itemDown = (it: PlanItem) => (e: React.PointerEvent) => {
    if (p.tool === "eraser") {
      e.stopPropagation();
      p.onDelete(it.id);
      return;
    }
    if (p.tool !== "select") return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    p.onSelect(it.id);
    drag.current = { kind: "move", id: it.id, from: toMm(e.clientX, e.clientY), orig: it.points.map((q) => [q[0], q[1]] as [number, number]) };
  };
  const itemEnter = (it: PlanItem) => (e: React.PointerEvent) => {
    if (p.tool === "eraser" && e.buttons === 1) p.onDelete(it.id);
  };

  const startDown = (pr: Program) => (e: React.PointerEvent) => {
    if (p.tool !== "select") return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "start", programId: pr.id, from: toMm(e.clientX, e.clientY), orig: { ...pr.start } };
  };
  const rotateDown = (pr: Program) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "rotate", programId: pr.id, orig: { ...pr.start } };
  };

  const cursor =
    p.tool === "select" ? (drag.current?.kind === "pan" ? "grabbing" : "grab") : p.tool === "eraser" ? "cell" : p.tool === "text" ? "text" : "crosshair";

  const strokeFor = (w: number) => 4 + w * 3;

  const renderItem = (it: PlanItem) => {
    if (!itemVisible(it)) return null;
    const dim = it.programId && p.activeProgramId && it.programId !== p.activeProgramId ? 0.45 : 1;
    const sel = it.id === p.selectedId;
    const sw = strokeFor(it.width);
    const hit = { onPointerDown: itemDown(it), onPointerEnter: itemEnter(it), style: { cursor: p.tool === "select" ? "move" : p.tool === "eraser" ? "cell" : undefined } };
    const selStroke = sel ? <path d={smoothPath(it.points)} fill="none" stroke="var(--ink)" strokeWidth={sw + 10} strokeOpacity="0.18" strokeLinecap="round" /> : null;
    switch (it.kind) {
      case "pen":
        return (
          <g key={it.id} opacity={dim}>
            {selStroke}
            <path d={smoothPath(it.points)} fill="none" stroke={it.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
            <path d={smoothPath(it.points)} fill="none" stroke="transparent" strokeWidth={Math.max(30, sw + 20)} {...hit} />
          </g>
        );
      case "arrow": {
        const [a, b] = it.points;
        return (
          <g key={it.id} opacity={dim}>
            {sel && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--ink)" strokeOpacity="0.18" strokeWidth={sw + 12} strokeLinecap="round" />}
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={it.color} strokeWidth={sw} strokeLinecap="round" />
            <polygon points={arrowHead(a[0], a[1], b[0], b[1], 26 + sw * 2.2)} fill={it.color} stroke={it.color} strokeWidth="3" strokeLinejoin="round" />
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={Math.max(34, sw + 22)} {...hit} />
          </g>
        );
      }
      case "path": {
        const { segs, turns } = segmentInfo(it.points);
        const d = it.points.map((q, i) => (i ? "L" : "M") + q[0] + "," + q[1]).join("");
        return (
          <g key={it.id} opacity={dim}>
            {sel && <path d={d} fill="none" stroke="var(--ink)" strokeOpacity="0.18" strokeWidth={sw + 12} strokeLinejoin="round" />}
            <path d={d} fill="none" stroke={it.color} strokeWidth={sw} strokeLinejoin="round" strokeDasharray={`${sw * 4} ${sw * 2}`} />
            {segs.map((s, i) => (
              <g key={i}>
                <polygon points={arrowHead(s.mx - Math.cos((s.ang * Math.PI) / 180) * 20, s.my - Math.sin((s.ang * Math.PI) / 180) * 20, s.mx, s.my, 22 + sw)} fill={it.color} />
                <text x={s.mx} y={s.my - 22} textAnchor="middle" fontSize="28" fontWeight="600" fill="var(--ink)" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 8 }} className="num">
                  {Math.round(s.mm)} mm
                </text>
              </g>
            ))}
            {it.points.map((q, i) => (
              <circle key={i} cx={q[0]} cy={q[1]} r={i === 0 ? 14 : 11} fill={i === 0 ? it.color : "var(--surface)"} stroke={it.color} strokeWidth="5" />
            ))}
            {turns.map((tn, i) =>
              Math.abs(tn.deg) >= 1 ? (
                <text key={"t" + i} x={tn.x + 18} y={tn.y + 40} fontSize="26" fontWeight="600" fill={it.color} style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 8 }} className="num">
                  {tn.deg > 0 ? "+" : "−"}{Math.abs(Math.round(tn.deg))}°
                </text>
              ) : null,
            )}
            <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(34, sw + 22)} {...hit} />
          </g>
        );
      }
      case "zone": {
        const [a, b] = it.points;
        const x = Math.min(a[0], b[0]);
        const y = Math.min(a[1], b[1]);
        const w = Math.abs(b[0] - a[0]);
        const h = Math.abs(b[1] - a[1]);
        return (
          <g key={it.id} opacity={dim}>
            <rect x={x} y={y} width={w} height={h} rx="18" fill={it.color} fillOpacity="0.16" stroke={it.color} strokeWidth={sel ? sw + 4 : sw} strokeDasharray={sel ? "16 10" : undefined} {...hit} />
          </g>
        );
      }
      case "text": {
        const [a] = it.points;
        const fs = 34 + it.width * 10;
        return (
          <g key={it.id} opacity={dim}>
            <text
              x={a[0]}
              y={a[1]}
              fontSize={fs}
              fontWeight="700"
              fill={it.color}
              style={{ paintOrder: "stroke", stroke: it.color === "#ffffff" ? "#1b2420" : "var(--surface)", strokeWidth: fs * 0.22, strokeLinejoin: "round", cursor: p.tool === "select" ? "move" : undefined }}
              onPointerDown={itemDown(it)}
              onPointerEnter={itemEnter(it)}
              onDoubleClick={(e) => {
                const req = { x: a[0], y: a[1], clientX: e.clientX, clientY: e.clientY };
                window.setTimeout(() => p.onTextRequest(req, it), 0);
              }}
            >
              {it.text}
            </text>
            {sel && <circle cx={a[0] - 12} cy={a[1] - fs * 0.35} r="8" fill="var(--ink)" />}
          </g>
        );
      }
      case "robot": {
        const [a] = it.points;
        const h = it.heading ?? 0;
        const hx = a[0] + Math.cos((h * Math.PI) / 180) * (p.profile.axleToFrontMm + 60);
        const hy = a[1] + Math.sin((h * Math.PI) / 180) * (p.profile.axleToFrontMm + 60);
        return (
          <g key={it.id} opacity={dim}>
            <RobotShape x={a[0]} y={a[1]} heading={h} profile={p.profile} color={it.color} ghost selected={sel} />
            <circle cx={a[0]} cy={a[1]} r={Math.max(p.profile.widthMm, p.profile.lengthMm) / 2} fill="transparent" {...hit} />
            {sel && (
              <circle
                cx={hx}
                cy={hy}
                r="20"
                fill="var(--surface)"
                stroke="var(--ink)"
                strokeWidth="5"
                style={{ cursor: "grab" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  drag.current = { kind: "rotateItem", id: it.id };
                }}
              />
            )}
          </g>
        );
      }
    }
  };

  const draftEl = (() => {
    if (!draft) return null;
    const sw = strokeFor(p.width);
    if (p.tool === "pen") return <path d={smoothPath(draft)} fill="none" stroke={p.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />;
    if (p.tool === "arrow") {
      const [a, b] = [draft[0], draft[draft.length - 1]];
      return (
        <g opacity="0.8">
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={p.color} strokeWidth={sw} strokeLinecap="round" />
          <polygon points={arrowHead(a[0], a[1], b[0], b[1], 26 + sw * 2.2)} fill={p.color} />
        </g>
      );
    }
    if (p.tool === "zone") {
      const [a, b] = [draft[0], draft[draft.length - 1]];
      return <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} rx="18" fill={p.color} fillOpacity="0.14" stroke={p.color} strokeWidth={sw} strokeDasharray="14 10" />;
    }
    if (p.tool === "path") {
      const { segs } = segmentInfo(draft);
      return (
        <g opacity="0.85">
          <path d={draft.map((q, i) => (i ? "L" : "M") + q[0] + "," + q[1]).join("")} fill="none" stroke={p.color} strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 2}`} />
          {draft.slice(0, -1).map((q, i) => (
            <circle key={i} cx={q[0]} cy={q[1]} r="11" fill="var(--surface)" stroke={p.color} strokeWidth="5" />
          ))}
          {segs.length > 0 && (
            <text x={segs[segs.length - 1].mx} y={segs[segs.length - 1].my - 22} textAnchor="middle" fontSize="28" fontWeight="600" fill="var(--ink)" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 8 }} className="num">
              {Math.round(segs[segs.length - 1].mm)} mm
            </text>
          )}
        </g>
      );
    }
    return null;
  })();

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      style={{ display: "block", cursor, touchAction: "none", userSelect: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => {
        p.onCursor(null);
        setHover(null);
      }}
      onDoubleClick={() => p.tool === "path" && finishPath()}
      onContextMenu={(e) => e.preventDefault()}
      role="application"
      aria-label="FLL table 2362 × 1143 mm"
    >
      <MatLayer mode={p.mode} grid={p.grid} />
      <MissionLayer missions={p.missions} mode={p.mode} highlight={p.missionHighlight} />
      <g>{p.items.map(renderItem)}</g>
      {/* run trails */}
      {p.runs.map((r) => {
        let d = "";
        const step = Math.max(1, Math.floor(r.idx / 800));
        for (let i = 0; i <= r.idx && i < r.x.length; i += step) d += (d ? "L" : "M") + r.x[i].toFixed(1) + "," + r.y[i].toFixed(1);
        const i = Math.min(r.idx, r.x.length - 1);
        return (
          <g key={"run" + r.programId} style={{ pointerEvents: "none" }}>
            <path d={d} fill="none" stroke={r.color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            <RobotShape x={r.x[i]} y={r.y[i]} heading={r.h[i]} profile={p.profile} color={r.color} />
          </g>
        );
      })}
      {/* program start poses */}
      {p.programs.map((pr, i) => {
        if (!pr.visible) return null;
        const active = pr.id === p.activeProgramId;
        const hasRun = p.runs.some((r) => r.programId === pr.id);
        const s = pr.start;
        const hx = s.x + Math.cos((s.headingDeg * Math.PI) / 180) * (p.profile.axleToFrontMm + 70);
        const hy = s.y + Math.sin((s.headingDeg * Math.PI) / 180) * (p.profile.axleToFrontMm + 70);
        return (
          <g key={"start" + pr.id} opacity={active ? 1 : 0.55}>
            <RobotShape x={s.x} y={s.y} heading={s.headingDeg} profile={p.profile} color={pr.color} label={`P${i + 1}`} ghost={hasRun} />
            <circle
              cx={s.x}
              cy={s.y}
              r={Math.min(p.profile.widthMm, p.profile.lengthMm) / 2}
              fill="transparent"
              style={{ cursor: p.tool === "select" ? "move" : undefined, pointerEvents: p.tool === "select" ? "all" : "none" }}
              onPointerDown={startDown(pr)}
            />
            {active && p.tool === "select" && (
              <g>
                <line x1={s.x} y1={s.y} x2={hx} y2={hy} stroke={pr.color} strokeWidth="4" strokeDasharray="8 8" />
                <circle cx={hx} cy={hy} r="20" fill="var(--surface)" stroke={pr.color} strokeWidth="6" style={{ cursor: "grab" }} onPointerDown={rotateDown(pr)} />
              </g>
            )}
          </g>
        );
      })}
      {draftEl}
      {hover && p.tool !== "select" && p.tool !== "eraser" && hover[0] >= 0 && hover[1] >= 0 && hover[0] <= TABLE_W && hover[1] <= TABLE_H && (
        <circle cx={hover[0]} cy={hover[1]} r="6" fill={p.color} opacity="0.7" style={{ pointerEvents: "none" }} />
      )}
    </svg>
  );
});

export default FieldView;
