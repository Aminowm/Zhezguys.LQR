// Robot configurator: 3D view or top view + LEGO parts catalog + live physics numbers.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RotateCw, Copy, Trash2, AlertTriangle, Scale, Move, Box, LayoutGrid, ArrowUp, ArrowDown, Loader2, Boxes, SlidersHorizontal } from "lucide-react";
import { useT, DictKey } from "../i18n";
import { useApp } from "../state/app";
import {
  buildStats, fixedParts, massOfPart, newPart, Part, PartKind, PART_SPECS, RobotBuild, TEMPLATES, wheelWidth, partId, partZ,
} from "../robot/build";
import { CATALOG_BY_ID } from "../robot/catalog";
import CatalogPanel, { useItemName } from "./builder/CatalogPanel";

const Robot3D = lazy(() => import("./builder/Robot3D"));

const snap = (v: number, s = 4) => Math.round(v / s) * s;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// top view: screen x = robot y, screen y = −robot x
const VB = { x: -230, y: -260, w: 460, h: 480 };

export function PartGlyph({ kind, len, wid, selected, thin }: { kind: PartKind; len: number; wid: number; selected?: boolean; thin?: boolean }) {
  const w = wid;
  const h = len;
  const sel = selected ? { stroke: "var(--primary)", strokeWidth: 3 } : {};
  switch (kind) {
    case "hub":
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="7" fill="#f5f6fa" stroke="#aeb6cc" strokeWidth="1.5" {...sel} />
          <rect x={-w / 2 + 8} y={-h / 2 + 10} width={w - 16} height={w - 16} rx="4" fill="#1b2238" />
          <circle cx="0" cy={h / 2 - 14} r="6" fill="#d7dbe6" stroke="#9aa3b8" />
        </g>
      );
    case "motorL":
    case "motorM":
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="8" fill="#f5f6fa" stroke="#aeb6cc" strokeWidth="1.5" {...sel} />
          <circle cx="0" cy={-h / 2 + 14} r={Math.min(w, 28) / 2 - 2} fill="#14a3c8" />
          <circle cx="0" cy={-h / 2 + 14} r="4" fill="#ffffff" />
        </g>
      );
    case "colorSensor":
    case "forceSensor":
    case "distanceSensor":
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="5" fill="#ffffff" stroke="#9aa3b8" strokeWidth="1.5" {...sel} />
          {kind === "distanceSensor" ? (
            <>
              <circle cx={-w / 4} cy="0" r="7" fill="#1b2238" />
              <circle cx={w / 4} cy="0" r="7" fill="#1b2238" />
            </>
          ) : (
            <circle cx="0" cy="0" r="6" fill={kind === "colorSensor" ? "#1b2238" : "#e0a000"} />
          )}
        </g>
      );
    case "frame":
      return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="10" fill="#3f6fe0" fillOpacity="0.14" stroke="#3f6fe0" strokeWidth="2" strokeDasharray="8 5" {...sel} />;
    case "attachment":
      return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill="#f59e0b" fillOpacity="0.3" stroke="#c2780a" strokeWidth="2" {...sel} />;
    case "openFrame":
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="4" fill="none" stroke="#c3cbe0" strokeWidth="8" />
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="4" fill="none" stroke={selected ? "var(--primary)" : "#8f9bbd"} strokeWidth={selected ? 3 : 1} />
        </g>
      );
    case "beam":
    case "brick": {
      const along = h >= w;
      const n = Math.max(1, Math.round((along ? h : w) / 8));
      const color = kind === "brick" ? "#f2c230" : thin ? "#8ccff5" : "#3aa7e8";
      return (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="4" fill={color} stroke={selected ? "var(--primary)" : "#1b6fa8"} strokeWidth={selected ? 3 : 1} />
          {Array.from({ length: n }, (_, i) => {
            const c = -((along ? h : w) / 2) + 4 + i * 8;
            return <circle key={i} cx={along ? 0 : c} cy={along ? c : 0} r="2.3" fill="#1b2a52" />;
          })}
        </g>
      );
    }
  }
}

type Drag = { kind: "part"; id: string; dx: number; dy: number } | { kind: "resize"; id: string } | { kind: "wheel" } | { kind: "caster" };

function TopView({ b, onChange, sel, setSel }: { b: RobotBuild; onChange(b: RobotBuild): void; sel: string | null; setSel(id: string | null): void }) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const stats = useMemo(() => buildStats(b), [b]);
  const fixed = useMemo(() => fixedParts(b), [b]);
  const selected = b.parts.find((p) => p.id === sel) ?? null;
  const ww = wheelWidth(b.wheelDiameterMm);
  const toRobot = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const r = m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    return { x: -r.y, y: r.x };
  };
  const setPart = (id: string, patch: Partial<Part>) => onChange({ ...b, parts: b.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
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
  const sorted = [...b.parts].sort((p, q) => partZ(p, b) - partZ(q, b));
  return (
    <svg
      ref={svgRef}
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      width="100%"
      height="100%"
      style={{ display: "block", touchAction: "none", background: "var(--surface-2)", borderRadius: 20 }}
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
      <text x="0" y={VB.y + 18} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--muted)">▲ {t("builder.front")}</text>
      {sorted.map((p) => (
        <g
          key={p.id}
          transform={`translate(${p.y} ${-p.x})`}
          style={{ cursor: "grab" }}
          onPointerDown={(e) => {
            setSel(p.id);
            const r = toRobot(e);
            start({ kind: "part", id: p.id, dx: r.x - p.x, dy: r.y - p.y })(e);
          }}
        >
          <PartGlyph kind={p.kind} len={p.len} wid={p.wid} selected={p.id === sel} thin={(p.h ?? 8) <= 4.5} />
        </g>
      ))}
      {fixed.motors.map((m, i) => (
        <g key={"dm" + i} transform={`translate(${m.y} ${-m.x})`} style={{ pointerEvents: "none" }}>
          <PartGlyph kind={b.driveMotor === "large" ? "motorL" : "motorM"} len={m.len} wid={m.wid} />
        </g>
      ))}
      {fixed.wheels.map((w, i) => (
        <g key={"w" + i} transform={`translate(${w.y} 0)`} style={{ cursor: "ew-resize" }} onPointerDown={start({ kind: "wheel" })}>
          <rect x={-ww / 2} y={-w.len / 2} width={ww} height={w.len} rx="6" fill="#1c2030" />
          {Array.from({ length: 7 }, (_, k) => (
            <line key={k} x1={-ww / 2 + 2} x2={ww / 2 - 2} y1={-w.len / 2 + ((k + 1) * w.len) / 8} y2={-w.len / 2 + ((k + 1) * w.len) / 8} stroke="#3b4256" strokeWidth="2" />
          ))}
        </g>
      ))}
      <g transform={`translate(0 ${-b.casterX})`} style={{ cursor: "ns-resize" }} onPointerDown={start({ kind: "caster" })}>
        {b.caster === "ball" ? <circle r="12" fill="#c8ccd6" stroke="#6b7390" strokeWidth="2" /> : <rect x="-14" y="-8" width="28" height="16" rx="8" fill="#c8ccd6" stroke="#6b7390" strokeWidth="2" />}
      </g>
      {selected && PART_SPECS[selected.kind].resizable && (
        <rect x={selected.y + selected.wid / 2 - 7} y={-(selected.x + selected.len / 2) - 7} width="14" height="14" rx="3" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" style={{ cursor: "nwse-resize" }} onPointerDown={start({ kind: "resize", id: selected.id })} />
      )}
      <g style={{ pointerEvents: "none" }}>
        <line x1={-b.axleTrackMm / 2} x2={b.axleTrackMm / 2} y1={b.wheelDiameterMm / 2 + 14} y2={b.wheelDiameterMm / 2 + 14} stroke="var(--ink-2)" strokeWidth="1.5" />
        <text x="0" y={b.wheelDiameterMm / 2 + 30} textAnchor="middle" fontSize="12" fill="var(--ink-2)" className="num">{b.axleTrackMm} mm</text>
      </g>
      <g transform={`translate(${stats.com.y} ${-stats.com.x})`} style={{ pointerEvents: "none" }}>
        <circle r="9" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" />
        <path d="M0,-9 A9,9 0 0 1 9,0 L0,0 Z M0,9 A9,9 0 0 1 -9,0 L0,0 Z" fill="var(--ink)" />
      </g>
    </svg>
  );
}

interface Props {
  value: RobotBuild;
  onChange(b: RobotBuild): void;
}

export default function RobotBuilder({ value: b, onChange }: Props) {
  const t = useT();
  const name = useItemName();
  const theme = useApp((s) => s.theme);
  const dark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [view, setView] = useState<"3d" | "top">("3d");
  const [tab, setTab] = useState<"parts" | "settings">("parts");
  const [sel, setSel] = useState<string | null>(null);
  const stats = useMemo(() => buildStats(b), [b]);
  const selected = b.parts.find((p) => p.id === sel) ?? null;
  const setPart = (id: string, patch: Partial<Part>) => onChange({ ...b, parts: b.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (!selected || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const step = e.shiftKey ? 16 : 4;
      const z = partZ(selected, b);
      if (e.key === "Delete" || e.key === "Backspace") {
        onChange({ ...b, parts: b.parts.filter((p) => p.id !== selected.id) });
        setSel(null);
      } else if (e.key === "ArrowUp") setPart(selected.id, { x: selected.x + step });
      else if (e.key === "ArrowDown") setPart(selected.id, { x: selected.x - step });
      else if (e.key === "ArrowLeft") setPart(selected.id, { y: selected.y - step });
      else if (e.key === "ArrowRight") setPart(selected.id, { y: selected.y + step });
      else if (e.key === "PageUp" || e.key === "+") setPart(selected.id, { z: z + 8 });
      else if (e.key === "PageDown" || e.key === "-") setPart(selected.id, { z: Math.max(0, z - 8) });
      else if (e.key.toLowerCase() === "r") setPart(selected.id, { len: selected.wid, wid: selected.len });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const warnText: Record<string, DictKey> = {
    tipBack: "builder.warn.tipBack",
    tipFront: "builder.warn.tipFront",
    lightWheels: "builder.warn.lightWheels",
    offCenter: "builder.warn.offCenter",
    highCom: "builder.warn.highCom",
  };
  const selName = selected
    ? selected.catalogId && CATALOG_BY_ID[selected.catalogId]
      ? name(CATALOG_BY_ID[selected.catalogId])
      : selected.kind === "frame"
        ? name(CATALOG_BY_ID.chassis)
        : name(CATALOG_BY_ID.block)
    : "";

  return (
    <div className="builder">
      <div className="builder-canvas">
        <div className="row spread wrap" style={{ gap: 8 }}>
          <div className="seg" role="group" aria-label={t("builder.view")}>
            <button type="button" aria-pressed={view === "3d"} onClick={() => setView("3d")}><Box size={15} /> 3D</button>
            <button type="button" aria-pressed={view === "top"} onClick={() => setView("top")}><LayoutGrid size={15} /> {t("builder.viewTop")}</button>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tiny muted">{t("builder.templates")}:</span>
            {TEMPLATES.map((tp) => (
              <button key={tp.id} type="button" className="btn sm" onClick={() => { onChange({ ...tp.build(), measuredMassG: b.measuredMassG }); setSel(null); }}>
                {t(`builder.tpl.${tp.id}` as DictKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="builder-stage">
          {view === "3d" ? (
            <Suspense fallback={<div className="stage-loading"><Loader2 className="spin" size={22} /></div>}>
              <Robot3D value={b} onChange={onChange} selected={sel} onSelect={setSel} dark={dark} />
            </Suspense>
          ) : (
            <TopView b={b} onChange={onChange} sel={sel} setSel={setSel} />
          )}
          <div className="stage-hint tiny"><Move size={13} /> {view === "3d" ? t("builder.hint3d") : t("builder.dragHint")}</div>
        </div>

        <AnimatePresence mode="wait">
          {selected && (
            <motion.div key={selected.id} className="glass-card inspector" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="row spread wrap" style={{ gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{selName}</strong>
                  {selected.catalogId && CATALOG_BY_ID[selected.catalogId]?.num && <span className="tiny muted"> #{CATALOG_BY_ID[selected.catalogId].num}</span>}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button type="button" className="icon-btn sm round" title={t("builder.layerDown")} aria-label={t("builder.layerDown")} onClick={() => setPart(selected.id, { z: Math.max(0, partZ(selected, b) - 8) })}><ArrowDown size={16} /></button>
                  <span className="num small" title={t("builder.height")} style={{ minWidth: 52, textAlign: "center" }}>z {Math.round(partZ(selected, b))}</span>
                  <button type="button" className="icon-btn sm round" title={t("builder.layerUp")} aria-label={t("builder.layerUp")} onClick={() => setPart(selected.id, { z: partZ(selected, b) + 8 })}><ArrowUp size={16} /></button>
                  <button type="button" className="icon-btn sm round" title={t("builder.rotate")} aria-label={t("builder.rotate")} onClick={() => setPart(selected.id, { len: selected.wid, wid: selected.len })}><RotateCw size={16} /></button>
                  <button type="button" className="icon-btn sm round" title={t("builder.duplicate")} aria-label={t("builder.duplicate")} onClick={() => { const c = { ...selected, id: partId(), y: selected.y + 16 }; onChange({ ...b, parts: [...b.parts, c] }); setSel(c.id); }}><Copy size={16} /></button>
                  <button type="button" className="icon-btn sm round" title={t("common.delete")} aria-label={t("common.delete")} onClick={() => { onChange({ ...b, parts: b.parts.filter((p) => p.id !== selected.id) }); setSel(null); }}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="row wrap" style={{ gap: 10, marginTop: 10 }}>
                <div className="field" style={{ width: 130 }}>
                  <label htmlFor="pm">{selected.catalogId ? t("builder.weighed") : t("builder.mass")}</label>
                  <div className="unit-input">
                    <input
                      id="pm"
                      className="input num"
                      type="number"
                      step="0.01"
                      min={0}
                      disabled={selected.kind === "frame"}
                      value={massOfPart(selected, b)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!(v > 0)) return;
                        if (selected.catalogId) onChange({ ...b, massOverride: { ...(b.massOverride ?? {}), [selected.catalogId]: v } });
                        else setPart(selected.id, { mass: v });
                      }}
                    />
                    <span>g</span>
                  </div>
                </div>
                {PART_SPECS[selected.kind].resizable && (
                  <>
                    <div className="field" style={{ width: 110 }}>
                      <label htmlFor="pl">{t("builder.len")}</label>
                      <div className="unit-input"><input id="pl" className="input num" type="number" min={16} max={320} step={8} value={selected.len} onChange={(e) => { const v = Number(e.target.value); if (v >= 8) setPart(selected.id, { len: v }); }} /><span>mm</span></div>
                    </div>
                    <div className="field" style={{ width: 110 }}>
                      <label htmlFor="pw2">{t("builder.wid")}</label>
                      <div className="unit-input"><input id="pw2" className="input num" type="number" min={16} max={320} step={8} value={selected.wid} onChange={(e) => { const v = Number(e.target.value); if (v >= 8) setPart(selected.id, { wid: v }); }} /><span>mm</span></div>
                    </div>
                  </>
                )}
              </div>
              {selected.kind === "frame" && <p className="hint" style={{ margin: "6px 0 0" }}>{t("builder.frameHint")}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="stack" style={{ gap: 12 }}>
        <div className="glass-card">
          <div className="seg" role="tablist" style={{ marginBottom: 12 }}>
            <button type="button" role="tab" aria-selected={tab === "parts"} aria-pressed={tab === "parts"} onClick={() => setTab("parts")}><Boxes size={15} /> {t("builder.tabParts")}</button>
            <button type="button" role="tab" aria-selected={tab === "settings"} aria-pressed={tab === "settings"} onClick={() => setTab("settings")}><SlidersHorizontal size={15} /> {t("builder.tabSettings")}</button>
          </div>
          {tab === "parts" ? (
            <CatalogPanel value={b} onChange={onChange} onSelect={(id) => setSel(id)} />
          ) : (
            <div className="stack" style={{ gap: 12 }}>
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
                  <label htmlFor="wd2">{t("robot.wheelDiameter")}</label>
                  <div className="unit-input"><input id="wd2" className="input num" type="number" min={30} max={150} step={0.1} value={b.wheelDiameterMm} onChange={(e) => { const v = Number(e.target.value); if (v >= 30 && v <= 150) onChange({ ...b, wheelDiameterMm: v, wheelId: undefined }); }} /><span>mm</span></div>
                </div>
                <div className="field">
                  <label htmlFor="trk">{t("robot.axleTrack")}</label>
                  <div className="unit-input"><input id="trk" className="input num" type="number" min={64} max={320} step={0.5} value={b.axleTrackMm} onChange={(e) => { const v = Number(e.target.value); if (v >= 40 && v <= 350) onChange({ ...b, axleTrackMm: v }); }} /><span>mm</span></div>
                </div>
                <div className="field">
                  <label htmlFor="cx">{t("builder.casterPos")}</label>
                  <div className="unit-input"><input id="cx" className="input num" type="number" min={-220} max={240} step={4} value={b.casterX} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== 0) onChange({ ...b, casterX: clamp(v, -220, 240) }); }} /><span>mm</span></div>
                </div>
              </div>
              <p className="hint" style={{ margin: 0 }}>{t("builder.wheelHint")}</p>
            </div>
          )}
        </div>

        <div className="glass-card">
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="mm2" className="row" style={{ gap: 6 }}><Scale size={14} /> {t("builder.measured")}</label>
            <div className="unit-input">
              <input id="mm2" className="input num" type="number" min={0} max={4000} placeholder={String(stats.computedMassG)} value={b.measuredMassG ?? ""} onChange={(e) => { const v = Number(e.target.value); onChange({ ...b, measuredMassG: e.target.value === "" || !(v > 0) ? undefined : v }); }} />
              <span>g</span>
            </div>
            <span className="hint">{t("builder.measuredHint")}</span>
          </div>
          <div className="grid-3" style={{ gap: 12 }}>
            <div className="stat"><span className="v">{stats.massG} g</span><span className="k">{b.measuredMassG ? t("builder.massScale") : t("builder.massEst")}</span></div>
            <div className="stat"><span className="v">{stats.partCount}</span><span className="k">{t("builder.partsCount")}</span></div>
            <div className="stat"><span className="v">{(stats.inertiaKgM2 * 1000).toFixed(2)}</span><span className="k">{t("robot.inertia")}, g·m²</span></div>
            <div className="stat"><span className="v">{stats.lengthMm}×{stats.widthMm}×{stats.heightMm}</span><span className="k">{t("builder.size")}, mm</span></div>
            <div className="stat"><span className="v">{Math.round(stats.wheelLoadShare * 100)} %</span><span className="k">{t("robot.wheelLoad")}</span></div>
            <div className="stat"><span className="v">{Math.round(stats.com.z)} mm</span><span className="k">{t("builder.comHeight")}</span></div>
          </div>
          {stats.warnings.length > 0 && (
            <div className="stack" style={{ gap: 6, marginTop: 12 }}>
              {stats.warnings.map((w) => (
                <div key={w} className="banner small warn">
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

export { newPart };
