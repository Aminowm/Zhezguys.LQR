import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  MousePointer2, Pencil, MoveUpRight, Route, Type, Bot, Square, Eraser, Undo2, Redo2, Grid3x3, ZoomIn, ZoomOut, Maximize,
  Plus, Play, Pause, RotateCcw, PanelRightClose, PanelRightOpen, Trash2, Eye, EyeOff, Wand2, Loader2, AlertTriangle,
  ClipboardList, Code2, Flag, CheckCircle2, CloudOff,
} from "lucide-react";
import { useApp } from "../state/app";
import { useT, DictKey } from "../i18n";
import { DRAW_COLORS, PROGRAM_COLORS, newProgram, uid } from "../state/workspace";
import { MISSIONS, TABLE_H, TABLE_W } from "../field/bioglow";
import { routeToCode } from "../field/route";
import FieldView, { FieldHandle, RunView } from "../components/field/FieldView";
import CodeEditor from "../components/CodeEditor";
import { buildProgram } from "../code/defaults";
import { runJobs, usePyStatus, warmPython } from "../sim/client";
import type { RunOutput } from "../sim/runner";
import type { CardMode, PlanItem, PlanTool, Program } from "../storage/types";

const TOOLS: { id: PlanTool; icon: ReactElement; key: string; label: DictKey }[] = [
  { id: "select", icon: <MousePointer2 size={19} />, key: "V", label: "table.tool.select" },
  { id: "pen", icon: <Pencil size={19} />, key: "P", label: "table.tool.pen" },
  { id: "arrow", icon: <MoveUpRight size={19} />, key: "A", label: "table.tool.arrow" },
  { id: "path", icon: <Route size={19} />, key: "R", label: "table.tool.path" },
  { id: "text", icon: <Type size={19} />, key: "T", label: "table.tool.text" },
  { id: "robot", icon: <Bot size={19} />, key: "O", label: "table.tool.robot" },
  { id: "zone", icon: <Square size={19} />, key: "Z", label: "table.tool.zone" },
  { id: "eraser", icon: <Eraser size={19} />, key: "E", label: "table.tool.eraser" },
];

const fmtTime = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

type Tab = "plan" | "code" | "run";

export default function TablePage() {
  const t = useT();
  const nav = useNavigate();
  const { ws, update, save, notify } = useApp();
  const py = usePyStatus();
  const fieldRef = useRef<FieldHandle>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<PlanTool>("select");
  const [color, setColor] = useState(DRAW_COLORS[1]);
  const [width, setWidth] = useState(2);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(ws?.programs[0]?.id ?? null);
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState<Tab>("plan");
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; left: number; top: number; id?: string; value: string } | null>(null);
  const past = useRef<PlanItem[][]>([]);
  const future = useRef<PlanItem[][]>([]);
  const dragSnap = useRef<PlanItem[] | null>(null);
  const [, force] = useState(0);

  // runs & playback
  const [runs, setRuns] = useState<Record<string, RunOutput & { located?: { file: string; line: number } | null }>>({});
  const [running, setRunning] = useState(false);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [runErr, setRunErr] = useState<string | null>(null);

  useEffect(() => {
    warmPython();
  }, []);

  const programs = ws?.programs ?? [];
  const active = programs.find((p) => p.id === activeId) ?? programs[0] ?? null;
  useEffect(() => {
    if (!active && programs[0]) setActiveId(programs[0].id);
  }, [active, programs]);

  const missions = MISSIONS;
  const highlight = useMemo(() => new Set(active?.missions ?? []), [active]);

  // ───── plan item edits with undo ─────
  const setItems = useCallback(
    (fn: (items: PlanItem[]) => PlanItem[], record = true) => {
      update((w) => {
        if (record) {
          past.current.push(w.plan.items);
          if (past.current.length > 100) past.current.shift();
          future.current = [];
        }
        return { ...w, plan: { ...w.plan, items: fn(w.plan.items) } };
      });
      force((x) => x + 1);
    },
    [update],
  );
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    update((w) => {
      future.current.push(w.plan.items);
      return { ...w, plan: { ...w.plan, items: prev } };
    });
    force((x) => x + 1);
  }, [update]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    update((w) => {
      past.current.push(w.plan.items);
      return { ...w, plan: { ...w.plan, items: next } };
    });
    force((x) => x + 1);
  }, [update]);

  const updateProgram = useCallback(
    (id: string, patch: Partial<Program>) => update((w) => ({ ...w, programs: w.programs.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    [update],
  );

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.closest?.(".cm-editor")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tl = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (tl) setTool(tl.id);
      if (e.key === "+" || e.key === "=") fieldRef.current?.zoom(1.25);
      if (e.key === "-") fieldRef.current?.zoom(0.8);
      if (e.key === "0") fieldRef.current?.fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // playback loop
  const maxT = useMemo(() => Math.max(0, ...Object.values(runs).map((r) => r.frames.t[r.frames.t.length - 1] ?? 0)), [runs]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setPlayT((pt) => {
        const n = pt + dt * speed;
        if (n >= maxT) {
          setPlaying(false);
          return maxT;
        }
        return n;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, maxT]);

  const runViews: RunView[] = useMemo(
    () =>
      Object.entries(runs)
        .map(([pid, r]) => {
          const pr = programs.find((p) => p.id === pid);
          if (!pr || !pr.visible) return null;
          const idx = Math.min(r.frames.t.length - 1, Math.max(0, Math.round(playT / 10)));
          return { programId: pid, color: pr.color, x: r.frames.x, y: r.frames.y, h: r.frames.h, idx };
        })
        .filter((x): x is RunView => !!x),
    [runs, playT, programs],
  );

  if (!ws) return null;

  const runPrograms = async (list: Program[]) => {
    if (!list.length) return;
    setRunning(true);
    setRunErr(null);
    setTab("run");
    try {
      const builds = list.map((p) => buildProgram(ws.files, p.code));
      const outs = await runJobs(list.map((p, i) => ({ code: builds[i].code, profile: ws.robot, start: p.start, maxTimeMs: 150_000 })));
      setRuns((prev) => {
        const next = { ...prev };
        list.forEach((p, i) => (next[p.id] = { ...outs[i], located: builds[i].locate(outs[i].runError?.line ?? null) }));
        return next;
      });
      setPlayT(0);
      setPlaying(true);
    } catch (e) {
      const msg = String((e as Error).message);
      setRunErr(msg === "TIMEOUT" ? t("common.timeout") : t("common.pyError", { msg }));
    } finally {
      setRunning(false);
    }
  };

  const addProgram = () => {
    const p = newProgram(programs.length, t("table.program", { n: programs.length + 1 }));
    update((w) => ({ ...w, programs: [...w.programs, p] }));
    setActiveId(p.id);
  };

  const deleteProgram = (p: Program) => {
    if (!confirm(t("table.deleteConfirm", { name: p.name }))) return;
    update((w) => ({
      ...w,
      programs: w.programs.filter((x) => x.id !== p.id),
      plan: { ...w.plan, items: w.plan.items.filter((i) => i.programId !== p.id) },
    }));
    setRuns(({ [p.id]: _, ...rest }) => rest);
    setActiveId(programs.find((x) => x.id !== p.id)?.id ?? null);
  };

  const routeToProgram = () => {
    if (!active) return;
    const sel = ws.plan.items.find((i) => i.id === selectedId && i.kind === "path");
    const path = sel ?? [...ws.plan.items].reverse().find((i) => i.kind === "path" && i.programId === active.id);
    if (!path) {
      notify(t("table.pathEmpty"));
      return;
    }
    const code = routeToCode(path.points, active.start, ws.robot.wheelDiameterMm);
    const base = active.code.endsWith("\n") ? active.code : active.code + "\n";
    updateProgram(active.id, { code: base + code });
    setTab("code");
    notify(t("table.pathInserted", { name: active.name }));
  };

  const commitText = () => {
    if (!textEdit) return;
    const value = textEdit.value.trim();
    if (textEdit.id) {
      if (value) setItems((items) => items.map((i) => (i.id === textEdit.id ? { ...i, text: value } : i)));
      else setItems((items) => items.filter((i) => i.id !== textEdit.id));
    } else if (value) {
      setItems((items) => [...items, { id: uid(), kind: "text", programId: active?.id ?? null, color, width, points: [[textEdit.x, textEdit.y]], text: value }]);
    }
    setTextEdit(null);
  };

  const activeRun = active ? runs[active.id] : undefined;
  const totalRunMs = programs.reduce((s, p) => s + (runs[p.id]?.endTime ?? 0), 0);
  const modeBtn = (m: CardMode, label: DictKey) => (
    <button aria-pressed={ws.plan.cardMode === m} onClick={() => update((w) => ({ ...w, plan: { ...w.plan, cardMode: m } }))}>
      {t(label)}
    </button>
  );

  return (
    <div className={"ws" + (panel ? "" : " panel-closed")}>
      {/* ───── top bar ───── */}
      <div className="ws-top">
        <div className="seg" role="group" aria-label="Card">
          {modeBtn("blank", "table.modeBlank")}
          {modeBtn("full", "table.modeFull")}
          {modeBtn("missions", "table.modeMissions")}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", flex: 1 }} role="group" aria-label={t("code.programs")}>
          {programs.map((p, i) => (
            <button key={p.id} className="prog-chip" aria-pressed={p.id === active?.id} onClick={() => setActiveId(p.id)} title={p.name}>
              <span className="dot" style={{ background: p.color, opacity: p.visible ? 1 : 0.35 }} />
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || `P${i + 1}`}</span>
              {runs[p.id] && <span className="tiny muted num">{fmtTime(runs[p.id].endTime)}</span>}
            </button>
          ))}
          <button className="btn ghost sm" onClick={addProgram} aria-label={t("table.addProgram")} title={t("table.addProgram")}>
            <Plus size={16} />
          </button>
        </div>
        <span className="row tiny muted" style={{ gap: 6 }} aria-live="polite">
          {save === "saving" ? <><Loader2 size={14} className="spin" /> {t("common.saving")}</> : save === "error" ? <><CloudOff size={14} /> {t("common.saveError")}</> : save === "saved" ? <><CheckCircle2 size={14} /> {t("common.saved")}</> : null}
        </span>
        <button className="icon-btn" onClick={() => setPanel((x) => !x)} aria-label={t("table.panel")} title={t("table.panel")} aria-pressed={panel}>
          {panel ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}
        </button>
      </div>

      {/* ───── tools ───── */}
      <div className="ws-tools" role="toolbar" aria-orientation="vertical" aria-label="Tools">
        {TOOLS.map((tl) => (
          <button key={tl.id} className={"icon-btn" + (tool === tl.id ? " active" : "")} aria-pressed={tool === tl.id} onClick={() => setTool(tl.id)} title={`${t(tl.label)} (${tl.key})`} aria-label={t(tl.label)}>
            {tl.icon}
          </button>
        ))}
        <div className="divider" style={{ margin: "4px 0" }} />
        <button className="icon-btn" onClick={undo} disabled={!past.current.length} title={`${t("table.undo")} (Ctrl+Z)`} aria-label={t("table.undo")}><Undo2 size={18} /></button>
        <button className="icon-btn" onClick={redo} disabled={!future.current.length} title={`${t("table.redo")} (Ctrl+Shift+Z)`} aria-label={t("table.redo")}><Redo2 size={18} /></button>
        <button className={"icon-btn" + (ws.plan.showGrid ? " active" : "")} aria-pressed={ws.plan.showGrid} onClick={() => update((w) => ({ ...w, plan: { ...w.plan, showGrid: !w.plan.showGrid } }))} title={t("table.grid")} aria-label={t("table.grid")}><Grid3x3 size={18} /></button>
        <div className="divider" style={{ margin: "4px 0" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 20px)", gap: 4, justifyContent: "center" }}>
          {DRAW_COLORS.map((c) => (
            <button key={c} className="swatch" style={{ background: c, width: 20, height: 20, borderRadius: 6 }} aria-pressed={color === c} aria-label={`Color ${c}`} onClick={() => setColor(c)} />
          ))}
        </div>
        <div className="divider" style={{ margin: "4px 0" }} />
        {[1, 2, 4].map((w) => (
          <button key={w} className={"icon-btn sm" + (width === w ? " active" : "")} aria-pressed={width === w} onClick={() => setWidth(w)} aria-label={`Width ${w}`} style={{ alignSelf: "center" }}>
            <span style={{ width: 18, height: 2 + w * 1.5, borderRadius: 4, background: "currentColor" }} />
          </button>
        ))}
      </div>

      {/* ───── canvas ───── */}
      <div className="ws-canvas" ref={canvasRef}>
        <FieldView
          ref={fieldRef}
          mode={ws.plan.cardMode}
          grid={ws.plan.showGrid}
          missions={missions}
          missionHighlight={highlight}
          items={ws.plan.items}
          programs={programs}
          activeProgramId={active?.id ?? null}
          tool={tool}
          color={color}
          width={width}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={(it) => {
            const item = { ...it, id: uid() };
            setItems((items) => [...items, item]);
            if (it.kind === "robot") {
              setTool("select");
              setSelectedId(item.id);
            }
          }}
          onChange={(id, patch, done) => {
            if (!done && !dragSnap.current) dragSnap.current = ws.plan.items;
            if (done) {
              if (dragSnap.current) {
                past.current.push(dragSnap.current);
                future.current = [];
              }
              dragSnap.current = null;
            }
            setItems((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i)), false);
          }}
          onDelete={(id) => {
            setItems((items) => items.filter((i) => i.id !== id));
            if (selectedId === id) setSelectedId(null);
          }}
          onStartChange={(pid, pose) => updateProgram(pid, { start: pose })}
          onCursor={setCursor}
          onTextRequest={(at, existing) => {
            const r = canvasRef.current!.getBoundingClientRect();
            setTextEdit({ x: at.x, y: at.y, left: at.clientX - r.left, top: at.clientY - r.top, id: existing?.id, value: existing?.text ?? "" });
          }}
          profile={ws.robot}
          runs={runViews}
        />
        <div className="canvas-hud" style={{ left: 10, top: 10 }} aria-live="off">
          <span className="num tiny" style={{ minWidth: 150 }}>
            {cursor ? t("table.cursor", { x: Math.round(cursor.x), y: Math.round(cursor.y) }) : `${TABLE_W} × ${TABLE_H} mm`}
          </span>
        </div>
        <div className="canvas-hud" style={{ left: 10, bottom: 10 }}>
          <button className="icon-btn sm" onClick={() => fieldRef.current?.zoom(0.8)} aria-label={t("table.zoomOut")} title={t("table.zoomOut")}><ZoomOut size={16} /></button>
          <button className="icon-btn sm" onClick={() => fieldRef.current?.fit()} aria-label={t("table.fit")} title={t("table.fit")}><Maximize size={16} /></button>
          <button className="icon-btn sm" onClick={() => fieldRef.current?.zoom(1.25)} aria-label={t("table.zoomIn")} title={t("table.zoomIn")}><ZoomIn size={16} /></button>
        </div>
        {tool === "path" && (
          <div className="canvas-hud tiny" style={{ left: "50%", top: 10, transform: "translateX(-50%)" }}>
            <Route size={14} /> {t("table.pathHint")}
          </div>
        )}
        {textEdit && (
          <input
            autoFocus
            className="input"
            aria-label={t("table.textPrompt")}
            placeholder={t("table.textPrompt")}
            value={textEdit.value}
            onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText();
              if (e.key === "Escape") setTextEdit(null);
            }}
            onBlur={commitText}
            style={{ position: "absolute", left: textEdit.left, top: textEdit.top - 20, width: 240, zIndex: 5, boxShadow: "var(--shadow-2)" }}
          />
        )}
      </div>

      {/* ───── side panel ───── */}
      <aside className="ws-panel" aria-label={t("table.panel")}>
        <div className="ws-panel-tabs" role="tablist">
          {(["plan", "code", "run"] as Tab[]).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {k === "plan" ? <ClipboardList size={16} /> : k === "code" ? <Code2 size={16} /> : <Play size={16} />}
              {t(`table.tab.${k}` as DictKey)}
            </button>
          ))}
        </div>
        <div className="ws-panel-body">
          {!active ? (
            <button className="btn primary" onClick={addProgram}><Plus size={16} /> {t("table.addProgram")}</button>
          ) : tab === "plan" ? (
            <PlanTab
              program={active}
              index={programs.indexOf(active)}
              onChange={(patch) => updateProgram(active.id, patch)}
              onDelete={() => deleteProgram(active)}
              onClear={() => {
                if (confirm(t("table.clearConfirm", { name: active.name }))) setItems((items) => items.filter((i) => i.programId !== active.id));
              }}
              totalRunMs={totalRunMs}
            />
          ) : tab === "code" ? (
            <div className="stack">
              <div className="row spread">
                <strong className="row" style={{ gap: 8 }}><span className="dot" style={{ background: active.color }} />{active.name}</strong>
                <button className="btn ghost sm" onClick={() => nav(`/code?p=${active.id}`)}><Code2 size={15} /> {t("nav.code")}</button>
              </div>
              <CodeEditor value={active.code} onChange={(v) => updateProgram(active.id, { code: v })} height="min(48vh, 460px)" errorLine={activeRun?.located?.file === "program" ? activeRun.located.line : null} label={active.name} />
              <div className="row wrap">
                <button className="btn primary" onClick={() => runPrograms([active])} disabled={running}>
                  {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />} {t("table.runProgram", { name: active.name })}
                </button>
                <button className="btn" onClick={routeToProgram} title={t("table.pathHint")}><Wand2 size={16} /> {t("table.pathToCode")}</button>
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>{t("code.order")}</p>
            </div>
          ) : (
            <RunTab
              program={active}
              run={activeRun}
              running={running}
              pyStatus={py.status}
              runErr={runErr}
              playT={playT}
              maxT={maxT}
              playing={playing}
              speed={speed}
              onRun={() => runPrograms([active])}
              onRunAll={() => runPrograms(programs.filter((p) => p.visible))}
              onPlay={() => {
                if (playT >= maxT) setPlayT(0);
                setPlaying((x) => !x);
              }}
              onRestart={() => {
                setPlayT(0);
                setPlaying(true);
              }}
              onSeek={(v) => {
                setPlaying(false);
                setPlayT(v);
              }}
              onSpeed={setSpeed}
              onOpenCode={(file, line) => nav(`/code?${file === "program" ? `p=${active.id}` : `f=${file.replace(".py", "")}`}&line=${line}`)}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function PlanTab(props: {
  program: Program;
  index: number;
  onChange(p: Partial<Program>): void;
  onDelete(): void;
  onClear(): void;
  totalRunMs: number;
}) {
  const t = useT();
  const { program: p } = props;
  const toggleMission = (id: string) => props.onChange({ missions: p.missions.includes(id) ? p.missions.filter((m) => m !== id) : [...p.missions, id] });
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="field">
        <label htmlFor="pname">{t("table.programName")}</label>
        <input id="pname" className="input" value={p.name} maxLength={40} onChange={(e) => props.onChange({ name: e.target.value })} />
      </div>
      <div className="row spread">
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Program color">
          {PROGRAM_COLORS.map((c) => (
            <button key={c} className="swatch" style={{ background: c, width: 24, height: 24 }} aria-pressed={p.color === c} aria-label={`Color ${c}`} onClick={() => props.onChange({ color: c })} />
          ))}
        </div>
        <button className="btn ghost sm" onClick={() => props.onChange({ visible: !p.visible })} aria-pressed={p.visible} title={t("table.visible")}>
          {p.visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
      <div className="field">
        <span className="label row" style={{ gap: 6 }}><Flag size={14} /> {t("table.start")}</span>
        <div className="grid-3" style={{ gap: 8 }}>
          {(["x", "y", "headingDeg"] as const).map((k) => (
            <div key={k} className="unit-input">
              <input
                className="input num"
                type="number"
                aria-label={k === "headingDeg" ? "heading" : k}
                value={Math.round(p.start[k])}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  const lim = k === "x" ? TABLE_W : k === "y" ? TABLE_H : 720;
                  props.onChange({ start: { ...p.start, [k]: k === "headingDeg" ? v : Math.max(0, Math.min(lim, v)) } });
                }}
              />
              <span>{k === "headingDeg" ? "°" : k}</span>
            </div>
          ))}
        </div>
        <span className="hint">{t("table.startHint")}</span>
      </div>
      <div className="field">
        <span className="label">{t("table.missions")}</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {MISSIONS.map((m) => {
            const on = p.missions.includes(m.id);
            return (
              <button key={m.id} className="btn sm" aria-pressed={on} onClick={() => toggleMission(m.id)} style={on ? { background: "var(--glow-soft)", borderColor: "var(--glow)", fontWeight: 650 } : undefined}>
                {m.id}
              </button>
            );
          })}
        </div>
      </div>
      <div className="field">
        <label htmlFor="pnotes">{t("table.notes")}</label>
        <textarea id="pnotes" className="input" placeholder={t("table.notesPh")} value={p.notes} onChange={(e) => props.onChange({ notes: e.target.value })} />
      </div>
      <div className="row wrap">
        <button className="btn sm" onClick={props.onClear}><Eraser size={15} /> {t("table.clearDrawings")}</button>
        <button className="btn sm danger" onClick={props.onDelete}><Trash2 size={15} /> {t("table.deleteProgram")}</button>
      </div>
      {props.totalRunMs > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row spread small"><span className="muted">{t("table.matchTotal")}</span><strong className="num">{fmtTime(props.totalRunMs)} / 2:30</strong></div>
          <div className="timebar"><div style={{ width: `${Math.min(100, (props.totalRunMs / 150000) * 100)}%`, background: props.totalRunMs > 150000 ? "var(--danger)" : undefined }} /></div>
        </div>
      )}
    </div>
  );
}

function RunTab(props: {
  program: Program;
  run?: RunOutput & { located?: { file: string; line: number } | null };
  running: boolean;
  pyStatus: string;
  runErr: string | null;
  playT: number;
  maxT: number;
  playing: boolean;
  speed: number;
  onRun(): void;
  onRunAll(): void;
  onPlay(): void;
  onRestart(): void;
  onSeek(v: number): void;
  onSpeed(v: number): void;
  onOpenCode(file: string, line: number): void;
}) {
  const t = useT();
  const r = props.run;
  const end = r ? r.endTime : 0;
  const shownT = Math.min(props.playT, end);
  const consoleRef = useRef<HTMLDivElement>(null);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row wrap">
        <button className="btn primary" onClick={props.onRun} disabled={props.running}>
          {props.running ? <Loader2 size={16} className="spin" /> : <Play size={16} />} {t("table.runProgram", { name: props.program.name })}
        </button>
        <button className="btn" onClick={props.onRunAll} disabled={props.running}><Play size={16} /> P1…Pn</button>
      </div>
      {(props.pyStatus === "loading" || (props.running && props.pyStatus !== "ready")) && (
        <div className="banner small"><Loader2 size={16} className="spin" /> {t("common.pyLoading")}</div>
      )}
      {props.runErr && <div className="banner error small" role="alert"><AlertTriangle size={16} /> {props.runErr}</div>}
      {!r ? (
        <p className="muted small">{t("table.noRun")}</p>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={r.endTime} className="stack" style={{ gap: 12 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <button className="icon-btn" onClick={props.onPlay} aria-label={props.playing ? t("table.pause") : t("table.play")}>{props.playing ? <Pause size={18} /> : <Play size={18} />}</button>
              <button className="icon-btn" onClick={props.onRestart} aria-label={t("common.reset")}><RotateCcw size={17} /></button>
              <input type="range" min={0} max={props.maxT} step={10} value={props.playT} onChange={(e) => props.onSeek(Number(e.target.value))} aria-label="Time" />
            </div>
            <div className="row spread">
              <div className="seg" role="group" aria-label={t("table.speed")}>
                {[0.5, 1, 2, 4].map((s) => (
                  <button key={s} aria-pressed={props.speed === s} onClick={() => props.onSpeed(s)}>{s}×</button>
                ))}
              </div>
              <span className="num small"><strong>{(shownT / 1000).toFixed(2)} s</strong></span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row spread small"><span className="muted">{t("table.matchTime", { t: fmtTime(end) })}</span></div>
              <div className="timebar"><div style={{ width: `${Math.min(100, (end / 150000) * 100)}%` }} /></div>
            </div>
            <div className="small">
              {t("table.finalPose", { x: Math.round(r.finalPose.x), y: Math.round(r.finalPose.y), h: (((r.finalPose.headingDeg - props.program.start.headingDeg) % 360 + 540) % 360 - 180).toFixed(1) })}
            </div>
            {r.runError && (
              <div className="banner error small" role="alert">
                <AlertTriangle size={16} style={{ flex: "none" }} />
                <div>
                  {t("table.errorAt", { type: r.runError.type, file: r.located?.file ?? "?", line: r.located?.line ?? "?", msg: r.runError.msg })}
                  {r.located && (
                    <div><button className="btn sm" style={{ marginTop: 6 }} onClick={() => props.onOpenCode(r.located!.file, r.located!.line)}><Code2 size={14} /> {t("nav.code")}</button></div>
                  )}
                </div>
              </div>
            )}
            {r.timeOver && <div className="banner small"><AlertTriangle size={16} /> {t("table.timeOver")}</div>}
            {r.events.some((e) => e.kind === "wall") && <div className="banner small"><AlertTriangle size={16} /> {t("table.hitWall")}</div>}
            <div>
              <div className="label" style={{ marginBottom: 6 }}>{t("table.console")}</div>
              <div className="console" ref={consoleRef}>
                {r.events.length === 0 ? <span className="i">—</span> : r.events.map((e, i) => (
                  <div key={i} className={e.kind === "error" ? "e" : e.kind === "print" ? "" : "i"}>
                    <span className="i">{(e.t / 1000).toFixed(2)}s </span>{e.text}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
