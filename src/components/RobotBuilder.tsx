// Visual robot builder: drag SPIKE Prime parts onto a top view of the robot.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RotateCw, Copy, Trash2, AlertTriangle, Scale, Move } from "lucide-react";
import { useT, DictKey } from "../i18n";
import {
  buildStats, fixedParts, FRAME_G_PER_MM2, newPart, Part, PartKind, PART_SPECS, RobotBuild, TEMPLATES, wheelWidth, partId,
} from "../robot/build";

const PALETTE: PartKind[] = ["hub", "motorL", "motorM", "colorSensor", "distanceSensor", "forceSensor", "frame", "attachment"];

const snap = (v: number, s = 4) => Math.round(v / s) * s;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// view box in screen coordinates (screen x = robot y, screen y = −robot x)
const VB = { x: -230, y: -260, w: 460, h: 480 };

export function PartGlyph({ kind, len, wid, selected }: { kind: PartKind; len: number; wid: number; selected?: boolean }) {
  // drawn centred at 0,0 in robot frame rotated to screen (w along y, h along x)
  const w = wid;
  const h = len;
  const sel = selected ? { stroke: "var(--primary)", strokeWidth: 3 } : {};
  switch (kind) {
    case "hub":
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="7" fill="#f4f2ec" stroke="#b9b3a3" strokeWidth="1.5" {...sel} />
          <rect x={-w / 2 + 8} y={-h / 2 + 10} width={w - 16} height={w - 16} rx="4" fill="#2b2f2d" />
          <circle cx="0" cy={h / 2 - 14} r="6" fill="#d8d3c6" stroke="#9a9484" />
        </g>
      );
    case "motorL":
    case "motorM":
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="8" fill="#f4f2ec" stroke="#b9b3a3" strokeWidth="1.5" {...sel} />
          <circle cx="0" cy={-h / 2 + 14} r={Math.min(w, 28) / 2 - 2} fill="#14a3b8" opacity="0.85" />
          <circle cx="0" cy={-h / 2 + 14} r="4" fill="#ffffff" />
        </g>
      );
    case "colorSensor":
    case "forceSensor":
    case "distanceSensor":
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="5" fill="#ffffff" stroke="#9a9484" strokeWidth="1.5" {...sel} />
          {kind === "distanceSensor" ? (
            <>
              <circle cx={-w / 4} cy="0" r="7" fill="#2b2f2d" />
              <circle cx={w / 4} cy="0" r="7" fill="#2b2f2d" />
            </>
          ) : (
            <circle cx="0" cy="0" r="6" fill={kind === "colorSensor" ? "#2b2f2d" : "#e0a000"} />
          )}
        </g>
      );
    case "frame":
      return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="10" fill="#4fb3d9" fillOpacity="0.16" stroke="#2a8ab0" strokeWidth="2" strokeDasharray="8 5" {...sel} />;
    case "attachment":
      return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill="#f59e0b" fillOpacity="0.28" stroke="#c2780a" strokeWidth="2" {...sel} />;
  }
}

interface Props {
  value: RobotBuild;
  onChange(b: RobotBuild): void;
}

type Drag =
  | { kind: "part"; id: string; dx: number; dy: number }
  | { kind: "resize"; id: string }
  | { kind: "wheel" }
  | { kind: "caster" };

export default function RobotBuilder({ value: b, onChange }: Props) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const stats = useMemo(() => buildStats(b), [b]);
  const fixed = useMemo(() => fixedParts(b), [b]);
  const selected = b.parts.find((p) => p.id === sel) ?? null;

  const toRobot = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const r = m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    return { x: -r.y, y: r.x }; // robot frame
  };

  const setPart = (id: string, patch: Partial<Part>) => onChange({ ...b, parts: b.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (!selected || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const step = e.shiftKey ? 16 : 4;
      if (e.key === "Delete" || e.key === "Backspace") {
        onChange({ ...b, parts: b.parts.filter((p) => p.id !== selected.id) });
        setSel(null);
      } else if (e.key === "ArrowUp") setPart(selected.id, { x: selected.x + step });
      else if (e.key === "ArrowDown") setPart(selected.id, { x: selected.x - step });
      else if (e.key === "ArrowLeft") setPart(selected.id, { y: selected.y - step });
      else if (e.key === "ArrowRight") setPart(selected.id, { y: selected.y + step });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const r = toRobot(e);
    if (d.kind === "part") setPart(d.id, { x: clamp(snap(r.x - d.dx), -200, 240), y: clamp(snap(r.y - d.dy), -200, 200) });
    else if (d.kind === "resize") {
      const p = b.parts.find((q) => q.id === d.id);
      if (p) setPart(d.id, { len: clamp(snap(Math.abs(r.x - p.x) * 2, 8), 16, 320), wid: clamp(snap(Math.abs(r.y - p.y) * 2, 8), 16, 320) });
    } else if (d.kind === "wheel") onChange({ ...b, axleTrackMm: clamp(snap(Math.abs(r.y) * 2, 8), 64, 320) });
    else if (d.kind === "caster") onChange({ ...b, casterX: clamp(snap(r.x), -220, 240) || 4 });
  };
  const start = (d: Drag) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = d;
  };

  const add = (kind: PartKind) => {
    const p = newPart(kind, 40 + (b.parts.length % 4) * 12, ((b.parts.length % 3) - 1) * 24);
    onChange({ ...b, parts: [...b.parts, p] });
    setSel(p.id);
  };

  const partLabel = (k: PartKind) => t(`builder.part.${k}` as DictKey);
  const massOf = (p: Part) => (p.kind === "frame" ? Math.round(p.len * p.wid * FRAME_G_PER_MM2) : p.mass);
  const ww = wheelWidth(b.wheelDiameterMm);
  const warnText: Record<string, DictKey> = {
    tipBack: "builder.warn.tipBack",
    tipFront: "builder.warn.tipFront",
    lightWheels: "builder.warn.lightWheels",
    offCenter: "builder.warn.offCenter",
  };

  return (
    <div className="builder">
      <div className="builder-canvas card flat">
        <div className="row spread wrap" style={{ marginBottom: 8, gap: 8 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tiny muted">{t("builder.templates")}:</span>
            {TEMPLATES.map((tp) => (
              <button key={tp.id} type="button" className="btn sm" onClick={() => { onChange({ ...tp.build(), measuredMassG: b.measuredMassG }); setSel(null); }}>
                {t(`builder.tpl.${tp.id}` as DictKey)}
              </button>
            ))}
          </div>
          <span className="tiny muted row" style={{ gap: 4 }}><Move size={13} /> {t("builder.dragHint")}</span>
        </div>
        <svg
          ref={svgRef}
          viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
          width="100%"
          style={{ display: "block", touchAction: "none", background: "var(--surface-2)", borderRadius: 12, maxHeight: 520 }}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onPointerDown={() => setSel(null)}
          role="application"
          aria-label={t("builder.title")}
        >
          <defs>
            <pattern id="studs" width="8" height="8" patternUnits="userSpaceOnUse" x="4" y="4">
              <circle cx="4" cy="4" r="0.9" fill="var(--border-strong)" />
            </pattern>
          </defs>
          <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill="url(#studs)" />
          <line x1={VB.x} x2={VB.x + VB.w} y1="0" y2="0" stroke="var(--border-strong)" strokeDasharray="6 6" />
          <line y1={VB.y} y2={VB.y + VB.h} x1="0" x2="0" stroke="var(--border-strong)" strokeDasharray="6 6" />
          <text x="0" y={VB.y + 18} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--muted)">▲ {t("builder.front")}</text>
          {/* user parts (frames first so they sit underneath) */}
          {[...b.parts].sort((p, q) => (p.kind === "frame" ? -1 : 0) - (q.kind === "frame" ? -1 : 0)).map((p) => (
            <g key={p.id} transform={`translate(${p.y} ${-p.x})`} style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                setSel(p.id);
                const r = toRobot(e);
                start({ kind: "part", id: p.id, dx: r.x - p.x, dy: r.y - p.y })(e);
              }}
            >
              <PartGlyph kind={p.kind} len={p.len} wid={p.wid} selected={p.id === sel} />
            </g>
          ))}
          {/* drive motors (fixed) */}
          {fixed.motors.map((m, i) => (
            <g key={"dm" + i} transform={`translate(${m.y} ${-m.x})`} style={{ pointerEvents: "none" }}>
              <PartGlyph kind={b.driveMotor === "large" ? "motorL" : "motorM"} len={m.len} wid={m.wid} />
            </g>
          ))}
          {/* wheels: drag sideways to change the axle track */}
          {fixed.wheels.map((w, i) => (
            <g key={"w" + i} transform={`translate(${w.y} 0)`} style={{ cursor: "ew-resize" }} onPointerDown={start({ kind: "wheel" })}>
              <rect x={-ww / 2} y={-w.len / 2} width={ww} height={w.len} rx="6" fill="#1f2421" />
              {Array.from({ length: 7 }, (_, k) => (
                <line key={k} x1={-ww / 2 + 2} x2={ww / 2 - 2} y1={-w.len / 2 + ((k + 1) * w.len) / 8} y2={-w.len / 2 + ((k + 1) * w.len) / 8} stroke="#3b423e" strokeWidth="2" />
              ))}
            </g>
          ))}
          {/* caster */}
          <g transform={`translate(0 ${-b.casterX})`} style={{ cursor: "ns-resize" }} onPointerDown={start({ kind: "caster" })}>
            {b.caster === "ball" ? (
              <circle r="12" fill="#c9c4b6" stroke="#6b665a" strokeWidth="2" />
            ) : (
              <rect x="-14" y="-8" width="28" height="16" rx="8" fill="#c9c4b6" stroke="#6b665a" strokeWidth="2" />
            )}
          </g>
          {/* resize handle */}
          {selected && PART_SPECS[selected.kind].resizable && (
            <rect
              x={selected.y + selected.wid / 2 - 7}
              y={-(selected.x + selected.len / 2) - 7}
              width="14"
              height="14"
              rx="3"
              fill="var(--surface)"
              stroke="var(--primary)"
              strokeWidth="3"
              style={{ cursor: "nwse-resize" }}
              onPointerDown={start({ kind: "resize", id: selected.id })}
            />
          )}
          {/* axle track dimension */}
          <g style={{ pointerEvents: "none" }}>
            <line x1={-b.axleTrackMm / 2} x2={b.axleTrackMm / 2} y1={b.wheelDiameterMm / 2 + 14} y2={b.wheelDiameterMm / 2 + 14} stroke="var(--ink-2)" strokeWidth="1.5" />
            <text x="0" y={b.wheelDiameterMm / 2 + 30} textAnchor="middle" fontSize="12" fill="var(--ink-2)" className="num">{b.axleTrackMm} mm</text>
          </g>
          {/* centre of mass */}
          <g transform={`translate(${stats.com.y} ${-stats.com.x})`} style={{ pointerEvents: "none" }}>
            <circle r="9" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" />
            <path d="M0,-9 A9,9 0 0 1 9,0 L0,0 Z M0,9 A9,9 0 0 1 -9,0 L0,0 Z" fill="var(--ink)" />
          </g>
        </svg>
        <div className="row wrap tiny muted" style={{ gap: 14, marginTop: 8 }}>
          <span className="row" style={{ gap: 6 }}><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.5" /><path d="M7,1 A6,6 0 0 1 13,7 L7,7 Z M7,13 A6,6 0 0 1 1,7 L7,7 Z" fill="var(--ink)" /></svg>{t("builder.com")}</span>
          <span>{t("builder.wheelHint")}</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 12 }}>
        <div className="card flat">
          <div className="label" style={{ marginBottom: 8 }}>{t("builder.addPart")}</div>
          <div className="builder-palette">
            {PALETTE.map((k) => (
              <button key={k} type="button" className="btn sm" onClick={() => add(k)} style={{ justifyContent: "flex-start" }}>
                <svg width="22" height="22" viewBox="-36 -36 72 72" aria-hidden>
                  <PartGlyph kind={k} len={Math.min(60, PART_SPECS[k].len)} wid={Math.min(60, PART_SPECS[k].wid)} />
                </svg>
                {partLabel(k)}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={selected.id} className="card flat" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="row spread" style={{ marginBottom: 8 }}>
                <strong>{partLabel(selected.kind)}</strong>
                <div className="row" style={{ gap: 2 }}>
                  <button type="button" className="icon-btn sm" title={t("builder.rotate")} aria-label={t("builder.rotate")} onClick={() => setPart(selected.id, { len: selected.wid, wid: selected.len })}><RotateCw size={16} /></button>
                  <button type="button" className="icon-btn sm" title={t("builder.duplicate")} aria-label={t("builder.duplicate")} onClick={() => { const c = { ...selected, id: partId(), y: selected.y + 16 }; onChange({ ...b, parts: [...b.parts, c] }); setSel(c.id); }}><Copy size={16} /></button>
                  <button type="button" className="icon-btn sm" title={t("common.delete")} aria-label={t("common.delete")} onClick={() => { onChange({ ...b, parts: b.parts.filter((p) => p.id !== selected.id) }); setSel(null); }}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="grid-3" style={{ gap: 8 }}>
                <div className="field">
                  <label htmlFor="pm">{t("builder.mass")}</label>
                  <div className="unit-input">
                    <input id="pm" className="input num" type="number" min={1} max={2000} disabled={selected.kind === "frame"} value={massOf(selected)} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setPart(selected.id, { mass: v }); }} />
                    <span>g</span>
                  </div>
                </div>
                {PART_SPECS[selected.kind].resizable && (
                  <>
                    <div className="field">
                      <label htmlFor="pl">{t("builder.len")}</label>
                      <div className="unit-input"><input id="pl" className="input num" type="number" min={16} max={320} step={8} value={selected.len} onChange={(e) => { const v = Number(e.target.value); if (v >= 8) setPart(selected.id, { len: v }); }} /><span>mm</span></div>
                    </div>
                    <div className="field">
                      <label htmlFor="pw2">{t("builder.wid")}</label>
                      <div className="unit-input"><input id="pw2" className="input num" type="number" min={16} max={320} step={8} value={selected.wid} onChange={(e) => { const v = Number(e.target.value); if (v >= 8) setPart(selected.id, { wid: v }); }} /><span>mm</span></div>
                    </div>
                  </>
                )}
              </div>
              {selected.kind === "frame" && <p className="hint" style={{ margin: "6px 0 0" }}>{t("builder.frameHint")}</p>}
            </motion.div>
          ) : (
            <motion.p key="none" className="small muted" style={{ margin: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{t("builder.selectHint")}</motion.p>
          )}
        </AnimatePresence>

        <div className="card flat stack" style={{ gap: 12 }}>
          <div className="field">
            <span className="label">{t("robot.wheelDiameter")}</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {[56, 62.4, 88].map((d) => (
                <button key={d} type="button" className="btn sm" aria-pressed={b.wheelDiameterMm === d} style={b.wheelDiameterMm === d ? { background: "var(--primary-soft)", borderColor: "var(--primary)" } : undefined} onClick={() => onChange({ ...b, wheelDiameterMm: d })}>{d} mm</button>
              ))}
              <div className="unit-input" style={{ width: 110 }}>
                <input className="input num" type="number" aria-label={t("robot.wheelDiameter")} min={30} max={150} step={0.1} value={b.wheelDiameterMm} onChange={(e) => { const v = Number(e.target.value); if (v >= 30 && v <= 150) onChange({ ...b, wheelDiameterMm: v }); }} />
                <span>mm</span>
              </div>
            </div>
          </div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div className="field">
              <span className="label">{t("robot.motor")}</span>
              <div className="seg" role="group" aria-label={t("robot.motor")}>
                <button type="button" aria-pressed={b.driveMotor === "medium"} onClick={() => onChange({ ...b, driveMotor: "medium" })}>{t("robot.motorMedium")}</button>
                <button type="button" aria-pressed={b.driveMotor === "large"} onClick={() => onChange({ ...b, driveMotor: "large" })}>{t("robot.motorLarge")}</button>
              </div>
            </div>
            <div className="field">
              <span className="label">{t("robot.caster")}</span>
              <div className="seg" role="group" aria-label={t("robot.caster")}>
                <button type="button" aria-pressed={b.caster === "ball"} onClick={() => onChange({ ...b, caster: "ball" })}>{t("robot.ball")}</button>
                <button type="button" aria-pressed={b.caster === "skid"} onClick={() => onChange({ ...b, caster: "skid" })}>{t("robot.skid")}</button>
              </div>
            </div>
          </div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label htmlFor="trk">{t("robot.axleTrack")}</label>
              <div className="unit-input"><input id="trk" className="input num" type="number" min={64} max={320} step={0.5} value={b.axleTrackMm} onChange={(e) => { const v = Number(e.target.value); if (v >= 40 && v <= 350) onChange({ ...b, axleTrackMm: v }); }} /><span>mm</span></div>
            </div>
            <div className="field">
              <label htmlFor="mm2" className="row" style={{ gap: 6 }}><Scale size={14} /> {t("builder.measured")}</label>
              <div className="unit-input">
                <input id="mm2" className="input num" type="number" min={0} max={4000} placeholder={String(stats.computedMassG)} value={b.measuredMassG ?? ""} onChange={(e) => { const v = Number(e.target.value); onChange({ ...b, measuredMassG: e.target.value === "" || !(v > 0) ? undefined : v }); }} />
                <span>g</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card flat">
          <div className="grid-3" style={{ gap: 12 }}>
            <div className="stat"><span className="v">{stats.massG} g</span><span className="k">{b.measuredMassG ? t("builder.massScale") : t("builder.massEst")}</span></div>
            <div className="stat"><span className="v">{stats.lengthMm}×{stats.widthMm}</span><span className="k">{t("builder.size")}, mm</span></div>
            <div className="stat"><span className="v">{(stats.inertiaKgM2 * 1000).toFixed(2)}</span><span className="k">{t("robot.inertia")}, g·m²</span></div>
            <div className="stat"><span className="v">{Math.round(stats.wheelLoadShare * 100)} %</span><span className="k">{t("robot.wheelLoad")}</span></div>
            <div className="stat"><span className="v">{stats.axleToFrontMm}</span><span className="k">{t("robot.axleToFront")}, mm</span></div>
            <div className="stat"><span className="v">{Math.round(stats.com.x)}, {Math.round(stats.com.y)}</span><span className="k">{t("builder.com")}, mm</span></div>
          </div>
          {stats.warnings.length > 0 && (
            <div className="stack" style={{ gap: 6, marginTop: 12 }}>
              {stats.warnings.map((w) => (
                <div key={w} className="banner small" style={{ borderColor: "color-mix(in srgb, var(--warn) 40%, transparent)" }}>
                  <AlertTriangle size={16} style={{ color: "var(--warn)", flex: "none" }} /> {t(warnText[w])}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
