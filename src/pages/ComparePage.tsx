import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Play, Loader2, RotateCcw, AlertTriangle, Trophy, Info } from "lucide-react";
import { useApp } from "../state/app";
import { useT } from "../i18n";
import { DEFAULT_PROFILE, mmToMotorDeg, RobotProfile } from "../sim/robot";
import { buildProgram, DEFAULT_FILES, CodeFileId } from "../code/defaults";
import { currentParams } from "../code/params";
import { runJobs, usePyStatus, warmPython } from "../sim/client";
import type { RunOutput } from "../sim/runner";
import { tuneRobot } from "../tuning/client";
import LineChart from "../components/LineChart";
import { TurnArena, StraightArena, ArenaRun } from "../components/Arena";

type Test = "turn" | "straight";
type Gains = "code" | "tuned";

interface Tuned {
  lqr: string;
  pid: string;
  gyro: { rate: number; acc: number };
  straight: string;
}

const f3 = (x: number) => +x.toFixed(3);

interface Row {
  id: string;
  label: string;
  color: string;
  out: RunOutput;
}

export default function ComparePage() {
  const t = useT();
  const { ws, session } = useApp();
  const py = usePyStatus();
  const [test, setTest] = useState<Test>("turn");
  const [angle, setAngle] = useState(90);
  const [dist, setDist] = useState(1000);
  const [robotSel, setRobotSel] = useState<"mine" | "default">(session ? "mine" : "default");
  const [gains, setGains] = useState<Gains>("tuned");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tunedCache, setTunedCache] = useState<Record<string, Tuned>>({});

  useEffect(() => {
    warmPython();
  }, []);

  const files: Record<CodeFileId, string> = session && ws ? ws.files : DEFAULT_FILES;
  const profile: RobotProfile = robotSel === "mine" && ws ? ws.robot : { ...DEFAULT_PROFILE };

  const endT = useMemo(() => (rows ? Math.max(...rows.map((r) => r.out.frames.t[r.out.frames.t.length - 1] ?? 0)) : 0), [rows]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setTime((x) => {
        const n = x + dt * 0.8;
        if (n >= endT) {
          setPlaying(false);
          return endT;
        }
        return n;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, endT]);

  const getTuned = async (): Promise<Tuned> => {
    const key = JSON.stringify(profile) + "|" + files.lqr.length + files.pid.length + files.helpers.length;
    if (tunedCache[key]) return tunedCache[key];
    const cur = currentParams(files);
    let tuned: Tuned;
    if (robotSel === "mine" && ws?.tune && ws.tune.robotKey === JSON.stringify(profile)) {
      const s = ws.tune;
      tuned = {
        lqr: `, Q=${s.lqr.Q}, R=${s.lqr.R}, b=${f3(s.lqr.b)}, kd=${f3(s.lqr.kd)}, Minpower=${s.lqr.Minpower}`,
        pid: `, Kp=${f3(s.pid.Kp)}, Ki=${f3(s.pid.Ki)}, Kd=${f3(s.pid.Kd)}, Minpower=${s.pid.Minpower}`,
        gyro: { rate: s.db.turn_rate, acc: s.db.turn_acceleration },
        straight: `, Q=${s.straight.Q}, R=${s.straight.R}, b=${f3(s.straight.b)}, kd=${f3(s.straight.kd)}`,
      };
    } else {
      const res = await tuneRobot(profile, { lqr: cur.lqr, pid: cur.pid, db: cur.db, straight: cur.straight });
      const sig = res.lqr.signature;
      const sQ = cur.straight.Q, sR = cur.straight.R;
      tuned = {
        lqr: `, Q=${sig.Q}, R=${sig.R}, b=${f3(sig.b)}, kd=${f3(sig.kd)}, Minpower=${sig.Minpower}`,
        pid: `, Kp=${f3(res.pid.params.Kp)}, Ki=${f3(res.pid.params.Ki)}, Kd=${f3(res.pid.params.Kd)}, Minpower=${res.pid.params.Minpower}`,
        gyro: { rate: res.db.params.turn_rate, acc: res.db.params.turn_acceleration },
        straight: `, Q=${sQ}, R=${sR}, b=${f3(Math.sqrt(sQ / sR) / res.straightLqr.params.K1!)}, kd=${f3(res.straightLqr.params.K2!)}`,
      };
    }
    setTunedCache((c) => ({ ...c, [key]: tuned }));
    return tuned;
  };

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const tn = gains === "tuned" ? await getTuned() : null;
      const deg = Math.round(mmToMotorDeg(dist, profile.wheelDiameterMm));
      const progs: { id: string; label: string; color: string; body: string }[] =
        test === "turn"
          ? [
              { id: "lqr", label: t("compare.lqr"), color: "var(--c-lqr)", body: `Gyro_reset(0)\nturn_lqr(${angle}${tn?.lqr ?? ""})\n` },
              { id: "pid", label: t("compare.pid"), color: "var(--c-pid)", body: `Gyro_reset(0)\nturn_pid(${angle}${tn?.pid ?? ""})\n` },
              {
                id: "gyro",
                label: t("compare.gyro"),
                color: "var(--c-gyro)",
                body: tn
                  ? `Gyro_reset(0)\nDrive_base.settings(turn_rate=${tn.gyro.rate}, turn_acceleration=${tn.gyro.acc})\nDrive_base.turn(${angle})\nDrive_base.stop()\n`
                  : `Gyro_reset(0)\nturn_gyro(${angle})\n`,
              },
            ]
          : [
              { id: "lqr", label: t("compare.lqr"), color: "var(--c-lqr)", body: `Gyro_reset(0)\nstraight_lqr(${deg}, 60, 0${tn?.straight ?? ""})\n` },
              { id: "pid", label: t("compare.pid"), color: "var(--c-pid)", body: `Gyro_reset(0)\nstraight_pid(${deg}, 60, 0)\n` },
              { id: "gyro", label: t("compare.gyro"), color: "var(--c-gyro)", body: `Gyro_reset(0)\nstraight_gyro(${dist})\n` },
              { id: "open", label: t("compare.openLoop"), color: "var(--muted)", body: `move_deg(60, 60, ${deg})\n` },
            ];
      const start = test === "turn" ? { x: 1181, y: 571, headingDeg: 0 } : { x: 250, y: 571, headingDeg: 0 };
      const outs = await runJobs(progs.map((p) => ({ code: buildProgram(files, p.body).code, profile, start, maxTimeMs: 20000, walls: false })));
      setRows(progs.map((p, i) => ({ id: p.id, label: p.label, color: p.color, out: outs[i] })));
      setTime(0);
      setPlaying(true);
    } catch (e) {
      const msg = String((e as Error).message);
      setErr(msg === "TIMEOUT" ? t("common.timeout") : t("common.pyError", { msg }));
    } finally {
      setBusy(false);
    }
  };

  // derived data
  const arena: ArenaRun[] = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => {
      const f = r.out.frames;
      const h0 = f.h[0];
      return {
        id: r.id,
        label: r.label,
        color: r.color,
        t: f.t,
        h: f.h.map((h) => h - h0),
        x: f.x.map((x) => x - f.x[0]),
        y: f.y.map((y) => y - f.y[0]),
      };
    });
  }, [rows]);

  const metrics = useMemo(() => {
    if (!rows) return [];
    return arena.map((a, i) => {
      const out = rows[i].out;
      const n = a.h.length - 1;
      const sign = Math.sign(angle) || 1;
      let over = 0;
      let peak = 0;
      for (let k = 0; k < a.h.length; k++) {
        over = Math.max(over, (a.h[k] - angle) * sign);
        peak = Math.max(peak, Math.abs(out.frames.dl[k]));
      }
      return {
        id: a.id,
        time: out.programEndMs,
        overshoot: Math.max(0, over),
        final: a.h[n] - (test === "turn" ? angle : 0),
        peak,
        lateral: a.y![n],
        distErr: a.x![n] - dist,
        error: out.runError,
      };
    });
  }, [arena, rows, angle, dist, test]);

  const best = (key: "time" | "overshoot" | "final" | "lateral" | "distErr" | "peak") => {
    if (!metrics.length) return null;
    const vals = metrics.filter((m) => m.id !== "open").map((m) => Math.abs(m[key] as number));
    const min = Math.min(...vals);
    return metrics.find((m) => Math.abs(m[key] as number) === min)?.id ?? null;
  };

  const testAngle = test === "turn";
  return (
    <div className="page">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: "clamp(1.7rem,3vw,2.4rem)" }}>{t("compare.title")}</h1>
        <p className="muted">{t("compare.sub")}</p>
      </motion.div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row wrap" style={{ gap: 18, alignItems: "flex-end" }}>
          <div className="field">
            <span className="label">{t("compare.test")}</span>
            <div className="seg" role="group" aria-label={t("compare.test")}>
              <button aria-pressed={test === "turn"} onClick={() => { setTest("turn"); setRows(null); }}>{t("compare.turn")}</button>
              <button aria-pressed={test === "straight"} onClick={() => { setTest("straight"); setRows(null); }}>{t("compare.straight")}</button>
            </div>
          </div>
          {testAngle ? (
            <div className="field">
              <span className="label">{t("compare.angle")}</span>
              <div className="seg" role="group" aria-label={t("compare.angle")}>
                {[30, 45, 90, 180, -90].map((a) => (
                  <button key={a} aria-pressed={angle === a} onClick={() => setAngle(a)}>{a}°</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="field">
              <span className="label">{t("compare.distance")}</span>
              <div className="seg" role="group" aria-label={t("compare.distance")}>
                {[300, 600, 1000, 1600].map((d) => (
                  <button key={d} aria-pressed={dist === d} onClick={() => setDist(d)}>{d} mm</button>
                ))}
              </div>
            </div>
          )}
          {session && (
            <div className="field">
              <span className="label">{t("compare.robot")}</span>
              <div className="seg" role="group" aria-label={t("compare.robot")}>
                <button aria-pressed={robotSel === "mine"} onClick={() => setRobotSel("mine")}>{t("compare.robotMine")}</button>
                <button aria-pressed={robotSel === "default"} onClick={() => setRobotSel("default")}>{t("compare.robotDefault")}</button>
              </div>
            </div>
          )}
          <div className="field">
            <span className="label">{t("compare.gains")}</span>
            <div className="seg" role="group" aria-label={t("compare.gains")}>
              <button aria-pressed={gains === "code"} onClick={() => setGains("code")}>{t("compare.gainsCode")}</button>
              <button aria-pressed={gains === "tuned"} onClick={() => setGains("tuned")}>{t("compare.gainsTuned")}</button>
            </div>
          </div>
          <button className="btn primary lg" onClick={run} disabled={busy} style={{ marginLeft: "auto" }}>
            {busy ? <Loader2 size={18} className="spin" /> : <Play size={18} />} {t("compare.run")}
          </button>
        </div>
        {!session && (
          <div className="banner small" style={{ marginTop: 14 }}>
            <Info size={16} /> <span>{t("compare.loginHint")} <Link to="/register">{t("nav.register")}</Link></span>
          </div>
        )}
        {busy && py.status !== "ready" && <div className="banner small" style={{ marginTop: 14 }}><Loader2 size={16} className="spin" /> {t("common.pyLoading")}</div>}
        {err && <div className="banner error small" role="alert" style={{ marginTop: 14 }}><AlertTriangle size={16} /> {err}</div>}
      </div>

      <div className="grid-3" style={{ marginBottom: 18 }}>
        {[
          { c: "var(--c-lqr)", n: t("compare.lqr"), d: t("compare.lqrDesc") },
          { c: "var(--c-pid)", n: t("compare.pid"), d: t("compare.pidDesc") },
          { c: "var(--c-gyro)", n: t("compare.gyro"), d: t("compare.gyroDesc") },
        ].map((x) => (
          <div key={x.n} className="row small" style={{ gap: 10, alignItems: "flex-start" }}>
            <span className="dot" style={{ background: x.c, marginTop: 6 }} />
            <span><strong>{x.n}</strong> <span className="muted">— {x.d}</span></span>
          </div>
        ))}
      </div>

      {rows && (
        <motion.div className="stack" style={{ gap: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="row spread">
            <span className="small muted num">{(time / 1000).toFixed(2)} s</span>
            <button className="btn sm" onClick={() => { setTime(0); setPlaying(true); }}><RotateCcw size={15} /> {t("landing.replay")}</button>
          </div>
          {testAngle ? (
            <TurnArena runs={arena} target={angle} time={time} profile={profile} />
          ) : (
            <StraightArena runs={arena} distance={dist} time={time} profile={profile} />
          )}
          <div className="grid-2">
            <div className="card">
              <LineChart
                title={testAngle ? t("compare.chartHeading") : t("compare.chartLateral")}
                xLabel="ms"
                yUnit={testAngle ? "°" : "mm"}
                refY={testAngle ? { value: angle, label: t("compare.targetLine") } : { value: 0, label: t("compare.targetLine") }}
                series={arena.map((a) => ({ id: a.id, label: a.label, color: a.color, dashed: a.id === "open", x: a.t, y: testAngle ? a.h : a.y! }))}
              />
            </div>
            <div className="card">
              <LineChart
                title={t("compare.chartPower")}
                xLabel="ms"
                yUnit="%"
                series={rows.map((r) => ({ id: r.id, label: r.label, color: r.color, dashed: r.id === "open", x: r.out.frames.t, y: r.out.frames.dl }))}
              />
            </div>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3>{t("compare.table")}</h3>
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th className="num">{t("compare.time")}</th>
                  {testAngle ? (
                    <>
                      <th className="num">{t("compare.overshoot")}</th>
                      <th className="num">{t("compare.final")}</th>
                    </>
                  ) : (
                    <>
                      <th className="num">{t("compare.lateral")}</th>
                      <th className="num">{t("compare.heading")}</th>
                      <th className="num">{t("compare.distErr")}</th>
                    </>
                  )}
                  <th className="num">{t("compare.peak")}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => {
                  const B = (k: Parameters<typeof best>[0], text: string) => (
                    <td className="num">
                      {best(k) === m.id ? <span className="row" style={{ gap: 4, justifyContent: "flex-end", fontWeight: 650 }}><Trophy size={13} aria-label={t("compare.best")} />{text}</span> : text}
                    </td>
                  );
                  return (
                    <tr key={m.id}>
                      <td><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: rows[i].color }} />{rows[i].label}{m.error && <span className="pill warn">{m.error.type}</span>}</span></td>
                      {B("time", `${Math.round(m.time)} ms`)}
                      {testAngle ? (
                        <>
                          {B("overshoot", `${m.overshoot.toFixed(1)}°`)}
                          {B("final", `${m.final >= 0 ? "+" : ""}${m.final.toFixed(2)}°`)}
                        </>
                      ) : (
                        <>
                          {B("lateral", `${m.lateral >= 0 ? "+" : ""}${m.lateral.toFixed(1)} mm`)}
                          {B("final", `${m.final >= 0 ? "+" : ""}${m.final.toFixed(2)}°`)}
                          {B("distErr", `${m.distErr >= 0 ? "+" : ""}${m.distErr.toFixed(1)} mm`)}
                        </>
                      )}
                      <td className="num">{Math.round(m.peak)} %</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
