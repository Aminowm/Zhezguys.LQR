import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Wand2, Loader2, Check, Cog, Copy, FlaskConical, ArrowRight, ChevronDown, Bot } from "lucide-react";
import { useApp } from "../state/app";
import { useT } from "../i18n";
import { breakawayTurnPower, derive, PortName, RobotProfile } from "../sim/robot";
import RobotBuilder from "../components/RobotBuilder";
import { applyBuild, buildFromProfile, RobotBuild } from "../robot/build";
import LineChart from "../components/LineChart";
import { tuneRobot, calibrateRobot } from "../tuning/client";
import type { FullTune } from "../tuning/tuner";
import { applyDefaults } from "../tuning/tuner";
import { applyGyroSettings, currentParams } from "../code/params";
import { calibrationProgram, parseCalibration, CalibrationFit } from "../tuning/calibrate";

const PORTS: PortName[] = ["A", "B", "C", "D", "E", "F"];
const r = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—");

function Num(props: { id: string; label: string; value: number; unit: string; min: number; max: number; step?: number; onChange(v: number): void; hint?: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <div className="unit-input">
        <input
          id={props.id}
          className="input num"
          type="number"
          inputMode="decimal"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={txt ?? String(props.value)}
          onChange={(e) => {
            setTxt(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(v) && v >= props.min && v <= props.max) props.onChange(v);
          }}
          onBlur={() => setTxt(null)}
          aria-describedby={props.hint ? props.id + "-h" : undefined}
        />
        <span>{props.unit}</span>
      </div>
      {props.hint && <span className="hint" id={props.id + "-h"}>{props.hint}</span>}
    </div>
  );
}

function Seg<T extends string>(props: { label: string; value: T; options: { v: T; label: string }[]; onChange(v: T): void }) {
  return (
    <div className="field">
      <span className="label">{props.label}</span>
      <div className="seg" role="group" aria-label={props.label} style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
        {props.options.map((o) => (
          <button key={o.v} type="button" aria-pressed={props.value === o.v} onClick={() => props.onChange(o.v)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function BeforeAfter({ rows }: { rows: { k: string; before: string; after: string; better: boolean }[] }) {
  const t = useT();
  return (
    <table className="data" style={{ marginTop: 6 }}>
      <thead><tr><th></th><th className="num">{t("robot.before")}</th><th className="num">{t("robot.after")}</th></tr></thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.k}><td>{x.k}</td><td className="num">{x.before}</td><td className="num" style={{ fontWeight: 600, color: x.better ? "var(--ok)" : undefined }}>{x.after}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RobotPage({ setup }: { setup?: boolean }) {
  const t = useT();
  const nav = useNavigate();
  const { ws, update, notify } = useApp();
  const [tune, setTune] = useState<FullTune | null>(null);
  const [tuning, setTuning] = useState(false);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [calOpen, setCalOpen] = useState(false);
  const [calText, setCalText] = useState("");
  const [calErr, setCalErr] = useState("");
  const [calFit, setCalFit] = useState<CalibrationFit | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);

  const p = ws?.robot;
  const d = useMemo(() => (p ? derive(p) : null), [p]);
  if (!ws || !p || !d) return null;
  const set = (patch: Partial<RobotProfile>) => {
    update((w) => ({ ...w, robot: { ...w.robot, ...patch } }));
    setTune(null);
  };
  const build = p.build ?? buildFromProfile(p);
  const setBuild = (b: RobotBuild) => {
    update((w) => ({ ...w, robot: applyBuild(w.robot, b) }));
    setTune(null);
  };

  const runTune = async () => {
    setTuning(true);
    setApplied({});
    try {
      const cur = currentParams(ws.files);
      const res = await tuneRobot(p, { lqr: cur.lqr, pid: cur.pid, db: cur.db, straight: cur.straight });
      setTune(res);
      const sQ = cur.straight.Q, sR = cur.straight.R;
      update((w) => ({
        ...w,
        tune: {
          at: new Date().toISOString(),
          robotKey: JSON.stringify(p),
          lqr: { Q: res.lqr.signature.Q, R: res.lqr.signature.R, b: res.lqr.signature.b, kd: res.lqr.signature.kd, Minpower: res.lqr.signature.Minpower },
          pid: { Kp: res.pid.params.Kp, Ki: res.pid.params.Ki, Kd: res.pid.params.Kd, Minpower: res.pid.params.Minpower },
          db: { turn_rate: res.db.params.turn_rate, turn_acceleration: res.db.params.turn_acceleration },
          straight: { Q: sQ, R: sR, b: Math.sqrt(sQ / sR) / res.straightLqr.params.K1!, kd: res.straightLqr.params.K2! },
        },
      }));
    } finally {
      setTuning(false);
    }
  };

  const apply = (which: "lqr" | "pid" | "db" | "straight") => {
    if (!tune) return;
    let file = "lqr.py";
    update((w) => {
      const files = { ...w.files };
      if (which === "lqr") {
        const s = tune.lqr.signature;
        files.lqr = applyDefaults(files.lqr, "turn_lqr", { b: s.b, kd: s.kd, Minpower: s.Minpower }).src;
      } else if (which === "pid") {
        const q = tune.pid.params;
        files.pid = applyDefaults(files.pid, "turn_pid", { Kp: q.Kp, Ki: q.Ki, Kd: q.Kd, Minpower: q.Minpower }).src;
        file = "pid.py";
      } else if (which === "db") {
        files.helpers = applyGyroSettings(files.helpers, tune.db.params.turn_rate, tune.db.params.turn_acceleration);
        file = "helpers.py";
      } else {
        const cur = currentParams(files).straight;
        files.lqr = applyDefaults(files.lqr, "straight_lqr", { b: Math.sqrt(cur.Q / cur.R) / tune.straightLqr.params.K1!, kd: tune.straightLqr.params.K2! }).src;
      }
      return { ...w, files };
    });
    setApplied((a) => ({ ...a, [which]: true }));
    notify(t("robot.appliedMsg", { file }));
  };

  const fitCal = async () => {
    setCalErr("");
    const parsed = parseCalibration(calText);
    if (!parsed) {
      setCalErr(t("robot.calBad"));
      return;
    }
    setCalBusy(true);
    try {
      setCalFit(await calibrateRobot(p, parsed.samples, parsed.power));
    } finally {
      setCalBusy(false);
    }
  };

  const lqrTrace = (k: "before" | "after") => {
    const run = tune?.lqr[k].runs[0];
    return run ? { x: run.trace.t, y: run.trace.h } : { x: [], y: [] };
  };

  return (
    <div className="page">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="row spread wrap" style={{ marginBottom: 18 }}>
          <div>
            {setup && <div className="eyebrow">{t("robot.setupTitle")}</div>}
            <h1 style={{ fontSize: "clamp(1.7rem,3vw,2.4rem)" }}>{t("robot.title")}</h1>
            <p className="muted" style={{ margin: 0 }}>{t("robot.sub")}</p>
          </div>
          {setup && (
            <button className="btn primary lg" onClick={() => nav("/table")}>
              {t("robot.saveContinue")} <ArrowRight size={18} />
            </button>
          )}
        </div>
      </motion.div>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card-title"><span className="feature-icon" style={{ width: 34, height: 34, margin: 0 }}><Bot size={18} /></span><h3 style={{ margin: 0 }}>{t("robot.builderTitle")}</h3></div>
        <RobotBuilder value={build} onChange={setBuild} />
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 18, alignItems: "start" }} className="robot-grid">
        <div className="card">
          <div className="card-title"><h3 style={{ margin: 0 }}>{t("robot.model")}</h3></div>
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="stat"><span className="v">{r(d.Jeff * 1000, 2)}</span><span className="k">{t("robot.inertia")}, g·m²</span></div>
            <div className="stat"><span className="v">{Math.round(d.vMax)}</span><span className="k">{t("robot.topSpeed")}, mm/s</span></div>
            <div className="stat"><span className="v">{Math.round(d.wMaxDeg)}</span><span className="k">{t("robot.spinRate")}, °/s</span></div>
            <div className="stat"><span className="v">{r(breakawayTurnPower(p), 1)} %</span><span className="k">{t("robot.breakaway")}</span></div>
            <div className="stat"><span className="v">{Math.round((-1 / d.yawA) * 1000)} ms</span><span className="k">{t("robot.timeConst")}</span></div>
            <div className="stat"><span className="v mono" style={{ fontSize: "0.92rem" }}>dω/dt = {r(d.yawA, 2)}·ω + {r(d.yawB, 1)}·u</span><span className="k">ω °/s, u %</span></div>
          </div>
          <button className="btn primary lg" style={{ width: "100%", marginTop: 16 }} onClick={runTune} disabled={tuning}>
            {tuning ? <Loader2 size={18} className="spin" /> : <Wand2 size={18} />} {tuning ? t("robot.tuning") : t("robot.tune")}
          </button>
          {tune && <p className="tiny muted" style={{ margin: "8px 0 0", textAlign: "center" }}>{t("robot.tuneDone", { s: (tune.ms / 1000).toFixed(1) })}</p>}
        </div>

        <section className="card">
          <button className="row spread" style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }} aria-expanded={advOpen} onClick={() => setAdvOpen((x) => !x)}>
            <span className="row"><span className="feature-icon" style={{ width: 34, height: 34, margin: 0 }}><Cog size={18} /></span><h3 style={{ margin: 0, textAlign: "left" }}>{t("robot.advanced")}</h3></span>
            <ChevronDown size={18} style={{ transform: advOpen ? "rotate(180deg)" : undefined, transition: "transform .2s", flex: "none" }} />
          </button>
          <AnimatePresence initial={false}>
            {advOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                <div className="grid-2" style={{ gap: 14, marginTop: 16 }}>
                  <div className="field">
                    <label htmlFor="lp">{t("robot.leftPort")}</label>
                    <select id="lp" className="input" value={p.leftPort} onChange={(e) => set({ leftPort: e.target.value as PortName })}>
                      {PORTS.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="rp">{t("robot.rightPort")}</label>
                    <select id="rp" className="input" value={p.rightPort} onChange={(e) => set({ rightPort: e.target.value as PortName })}>
                      {PORTS.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                  <Seg label={t("robot.leftForward")} value={p.leftForward} options={[{ v: "clockwise", label: t("robot.cw") }, { v: "counterclockwise", label: t("robot.ccw") }]} onChange={(v) => set({ leftForward: v })} />
                  <Seg label={t("robot.rightForward")} value={p.rightForward} options={[{ v: "clockwise", label: t("robot.cw") }, { v: "counterclockwise", label: t("robot.ccw") }]} onChange={(v) => set({ rightForward: v })} />
                  <div className="field">
                    <label htmlFor="bat">{t("robot.battery")}: <strong className="num">{p.batteryPct} %</strong></label>
                    <input id="bat" type="range" min={0} max={100} value={p.batteryPct} onChange={(e) => set({ batteryPct: Number(e.target.value) })} />
                  </div>
                  <Num id="gn" label={t("robot.gyroNoise")} value={p.gyroNoiseDeg} unit="°" min={0} max={1} step={0.01} onChange={(v) => set({ gyroNoiseDeg: v })} />
                  <Num id="mm" label={t("robot.motorMismatch")} value={p.motorMismatchPct} unit="%" min={0} max={15} step={0.5} onChange={(v) => set({ motorMismatchPct: v })} />
                  <Num id="wm" label={t("robot.wheelMismatch")} value={p.wheelMismatchPct} unit="%" min={0} max={5} step={0.1} onChange={(v) => set({ wheelMismatchPct: v })} />
                  <Num id="is" label={t("robot.inertiaScale")} value={p.inertiaScale} unit="×" min={0.3} max={4} step={0.05} onChange={(v) => set({ inertiaScale: v })} hint={t("robot.calibrated")} />
                  <Num id="ss" label={t("robot.scrubScale")} value={p.scrubScale} unit="×" min={0.2} max={6} step={0.05} onChange={(v) => set({ scrubScale: v })} hint={t("robot.calibrated")} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      <AnimatePresence>
        {tune && (
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 24 }}>
            <h2>{t("robot.results")}</h2>
            <div className="grid-2">
              <div className="card">
                <div className="card-title"><span className="dot" style={{ background: "var(--c-lqr)" }} /><h3 style={{ margin: 0 }}>turn_lqr</h3></div>
                <div className="small muted">{t("robot.analytic")}</div>
                <div className="formula" style={{ margin: "6px 0 10px" }}>
                  K1 = {r(tune.lqr.analytic.K1)}, K2 = {r(tune.lqr.analytic.K2, 3)} · ζ = {r(tune.lqr.analytic.zeta)}
                </div>
                <div className="small muted">{t("robot.refined")}</div>
                <div className="formula" style={{ margin: "6px 0 10px" }}>
                  turn_lqr(90, Q={tune.lqr.signature.Q}, R={tune.lqr.signature.R}, b={r(tune.lqr.signature.b, 3)}, kd={r(tune.lqr.signature.kd, 3)}, Minpower={tune.lqr.signature.Minpower})
                </div>
                <BeforeAfter
                  rows={[
                    { k: t("robot.avgTime"), before: `${Math.round(tune.lqr.before.meanTime)} ms`, after: `${Math.round(tune.lqr.after.meanTime)} ms`, better: tune.lqr.after.meanTime < tune.lqr.before.meanTime },
                    { k: t("robot.overshoot"), before: `${r(tune.lqr.before.meanOvershoot, 1)}°`, after: `${r(tune.lqr.after.meanOvershoot, 1)}°`, better: tune.lqr.after.meanOvershoot < tune.lqr.before.meanOvershoot },
                    { k: t("robot.finalErr"), before: `${r(tune.lqr.before.maxFinalError, 2)}°`, after: `${r(tune.lqr.after.maxFinalError, 2)}°`, better: tune.lqr.after.maxFinalError <= tune.lqr.before.maxFinalError },
                  ]}
                />
                <div style={{ marginTop: 12 }}>
                  <LineChart
                    height={190}
                    title="90°"
                    xLabel="ms"
                    yUnit="°"
                    refY={{ value: 90, label: t("compare.targetLine") }}
                    series={[
                      { id: "b", label: t("robot.before"), color: "var(--muted)", dashed: true, ...lqrTrace("before") },
                      { id: "a", label: t("robot.after"), color: "var(--c-lqr)", ...lqrTrace("after") },
                    ]}
                  />
                </div>
                <button className="btn primary" style={{ marginTop: 12 }} onClick={() => apply("lqr")} disabled={applied.lqr}>
                  {applied.lqr ? <Check size={16} /> : <Wand2 size={16} />} {applied.lqr ? t("common.applied") : t("robot.applyLqr")}
                </button>
              </div>

              <div className="stack" style={{ gap: 16 }}>
                <div className="card">
                  <div className="card-title"><span className="dot" style={{ background: "var(--c-pid)" }} /><h3 style={{ margin: 0 }}>turn_pid</h3></div>
                  <div className="formula" style={{ marginBottom: 10 }}>Kp={r(tune.pid.params.Kp, 3)}, Ki={r(tune.pid.params.Ki, 3)}, Kd={r(tune.pid.params.Kd, 3)}, Minpower={tune.pid.params.Minpower}</div>
                  <BeforeAfter
                    rows={[
                      { k: t("robot.avgTime"), before: `${Math.round(tune.pid.before.meanTime)} ms`, after: `${Math.round(tune.pid.after.meanTime)} ms`, better: tune.pid.after.meanTime < tune.pid.before.meanTime },
                      { k: t("robot.overshoot"), before: `${r(tune.pid.before.meanOvershoot, 1)}°`, after: `${r(tune.pid.after.meanOvershoot, 1)}°`, better: tune.pid.after.meanOvershoot < tune.pid.before.meanOvershoot },
                      { k: t("robot.finalErr"), before: `${r(tune.pid.before.maxFinalError, 2)}°`, after: `${r(tune.pid.after.maxFinalError, 2)}°`, better: tune.pid.after.maxFinalError <= tune.pid.before.maxFinalError },
                    ]}
                  />
                  <button className="btn" style={{ marginTop: 12 }} onClick={() => apply("pid")} disabled={applied.pid}>
                    {applied.pid ? <Check size={16} /> : <Wand2 size={16} />} {applied.pid ? t("common.applied") : t("robot.applyPid")}
                  </button>
                </div>
                <div className="card">
                  <div className="card-title"><span className="dot" style={{ background: "var(--c-gyro)" }} /><h3 style={{ margin: 0 }}>turn_gyro (DriveBase)</h3></div>
                  <div className="formula" style={{ marginBottom: 10 }}>Drive_base.settings(turn_rate={tune.db.params.turn_rate}, turn_acceleration={tune.db.params.turn_acceleration})</div>
                  <BeforeAfter
                    rows={[
                      { k: t("robot.avgTime"), before: `${Math.round(tune.db.before.meanTime)} ms`, after: `${Math.round(tune.db.after.meanTime)} ms`, better: tune.db.after.meanTime < tune.db.before.meanTime },
                      { k: t("robot.finalErr"), before: `${r(tune.db.before.maxFinalError, 2)}°`, after: `${r(tune.db.after.maxFinalError, 2)}°`, better: tune.db.after.maxFinalError <= tune.db.before.maxFinalError },
                    ]}
                  />
                  <button className="btn" style={{ marginTop: 12 }} onClick={() => apply("db")} disabled={applied.db}>
                    {applied.db ? <Check size={16} /> : <Wand2 size={16} />} {applied.db ? t("common.applied") : t("robot.applyDb")}
                  </button>
                </div>
                <div className="card">
                  <div className="card-title"><span className="dot" style={{ background: "var(--c-lqr)" }} /><h3 style={{ margin: 0 }}>straight_lqr</h3></div>
                  <div className="formula" style={{ marginBottom: 10 }}>K1={r(tune.straightLqr.params.K1!, 2)}, K2={r(tune.straightLqr.params.K2!, 3)}</div>
                  <BeforeAfter
                    rows={[
                      { k: t("robot.lateral") + " (1 m)", before: `${r(tune.straightLqr.before.lateral, 1)} mm`, after: `${r(tune.straightLqr.after.lateral, 1)} mm`, better: tune.straightLqr.after.lateral < tune.straightLqr.before.lateral },
                      { k: t("robot.headingErr"), before: `${r(tune.straightLqr.before.heading, 2)}°`, after: `${r(tune.straightLqr.after.heading, 2)}°`, better: tune.straightLqr.after.heading <= tune.straightLqr.before.heading },
                    ]}
                  />
                  <button className="btn" style={{ marginTop: 12 }} onClick={() => apply("straight")} disabled={applied.straight}>
                    {applied.straight ? <Check size={16} /> : <Wand2 size={16} />} {applied.straight ? t("common.applied") : t("robot.applyStraight")}
                  </button>
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* calibration */}
      <section className="card" style={{ marginTop: 24 }}>
        <button className="row spread" style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }} aria-expanded={calOpen} onClick={() => setCalOpen((x) => !x)}>
          <span className="row"><span className="feature-icon" style={{ width: 34, height: 34, margin: 0 }}><FlaskConical size={18} /></span><h3 style={{ margin: 0 }}>{t("robot.calTitle")}</h3></span>
          <ChevronDown size={18} style={{ transform: calOpen ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
        </button>
        <AnimatePresence initial={false}>
          {calOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
              <p className="muted" style={{ marginTop: 14 }}>{t("robot.calIntro")}</p>
              <div className="grid-2">
                <div className="stack">
                  <div className="small"><strong>1.</strong> {t("robot.calStep1")}</div>
                  <pre className="formula" style={{ maxHeight: 260, overflow: "auto", margin: 0, fontSize: 12 }}>{calibrationProgram()}</pre>
                  <button
                    className="btn sm"
                    style={{ alignSelf: "flex-start" }}
                    onClick={async () => {
                      await navigator.clipboard.writeText(ws.files.config + "\n" + calibrationProgram());
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t("common.copied") : t("common.copy")} (config + test)
                  </button>
                </div>
                <div className="stack">
                  <div className="small"><strong>2.</strong> {t("robot.calStep2")}</div>
                  <textarea className="input mono" style={{ minHeight: 200 }} placeholder={"ZG-CAL 40\n0 0.0\n10 0.4\n…\nZG-END"} aria-label={t("robot.calPaste")} value={calText} onChange={(e) => setCalText(e.target.value)} />
                  {calErr && <span className="err">{calErr}</span>}
                  <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={fitCal} disabled={calBusy || !calText.trim()}>
                    {calBusy ? <Loader2 size={16} className="spin" /> : <FlaskConical size={16} />} {calBusy ? t("robot.calFitting") : t("robot.calFit")}
                  </button>
                </div>
              </div>
              {calFit && (
                <div className="stack" style={{ marginTop: 16 }}>
                  <div className="banner glow">
                    <Check size={18} />
                    <span>
                      {t("robot.calResult", { before: r(calFit.rmsBefore, 2), after: r(calFit.rmsAfter, 2) })} · {t("robot.inertiaScale")} {calFit.inertiaScale} · {t("robot.scrubScale")} {calFit.scrubScale}
                    </span>
                  </div>
                  <LineChart
                    height={200}
                    xLabel="ms"
                    yUnit="°"
                    series={[
                      { id: "m", label: t("robot.calMeasured"), color: "var(--ink)", x: calFit.times, y: calFit.measured },
                      { id: "b", label: t("robot.calSimBefore"), color: "var(--muted)", dashed: true, x: calFit.times, y: calFit.simBefore },
                      { id: "a", label: t("robot.calSim"), color: "var(--c-lqr)", x: calFit.times, y: calFit.simAfter },
                    ]}
                  />
                  <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={() => set({ inertiaScale: calFit.inertiaScale, scrubScale: calFit.scrubScale })}>
                    <Check size={16} /> {t("robot.calUse")}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {setup && (
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 24 }}>
          <button className="btn primary lg" onClick={() => nav("/table")}>{t("robot.saveContinue")} <ArrowRight size={18} /></button>
        </div>
      )}
    </div>
  );
}

