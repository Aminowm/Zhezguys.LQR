import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Code2, Wand2, LayoutGrid, Lock, RotateCcw, GitCompareArrows, AtSign } from "lucide-react";
import { useT } from "../i18n";
import { DEFAULT_PROFILE } from "../sim/robot";
import { tuneRobot } from "../tuning/client";
import { TurnArena, ArenaRun } from "../components/Arena";
import { SOCIAL } from "../config";

export default function Landing() {
  const t = useT();
  const [runs, setRuns] = useState<ArenaRun[] | null>(null);
  const [time, setTime] = useState(0);
  const [stats, setStats] = useState<{ id: string; ms: number; err: number }[]>([]);

  useEffect(() => {
    let live = true;
    tuneRobot(DEFAULT_PROFILE).then((res) => {
      if (!live) return;
      const pick = (id: string, label: string, color: string, tr: { t: number[]; h: number[] }) => ({ id, label, color, t: tr.t, h: tr.h });
      setRuns([
        pick("lqr", "LQR", "var(--c-lqr)", res.lqr.after.runs[0].trace),
        pick("pid", "PID", "var(--c-pid)", res.pid.after.runs[0].trace),
        pick("gyro", "Pybricks gyro", "var(--c-gyro)", res.db.after.runs[0].trace),
      ]);
      setStats([
        { id: "lqr", ms: res.lqr.after.runs[0].returnMs, err: res.lqr.after.runs[0].finalError },
        { id: "pid", ms: res.pid.after.runs[0].returnMs, err: res.pid.after.runs[0].finalError },
        { id: "gyro", ms: res.db.after.runs[0].returnMs, err: res.db.after.runs[0].finalError },
      ]);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!runs) return;
    let raf = 0;
    let last = performance.now();
    const end = Math.max(...runs.map((r) => r.t[r.t.length - 1]));
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setTime((x) => (x + dt * 0.6 > end + 900 ? 0 : x + dt * 0.6));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runs]);

  const features = [
    { icon: <Code2 size={20} />, t: t("landing.f1t"), d: t("landing.f1d") },
    { icon: <Wand2 size={20} />, t: t("landing.f2t"), d: t("landing.f2d") },
    { icon: <LayoutGrid size={20} />, t: t("landing.f3t"), d: t("landing.f3d") },
    { icon: <Lock size={20} />, t: t("landing.f4t"), d: t("landing.f4d") },
  ];

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <div className="eyebrow">{t("landing.eyebrow")}</div>
            <h1>{t("landing.title")}</h1>
            <p className="lead">{t("landing.lead")}</p>
            <div className="row wrap" style={{ marginTop: 26 }}>
              <Link to="/register" className="btn primary lg">{t("landing.ctaRegister")} <ArrowRight size={18} /></Link>
              <Link to="/compare" className="btn lg"><GitCompareArrows size={18} /> {t("landing.ctaCompare")}</Link>
            </div>
          </motion.div>
          <motion.div className="card" style={{ padding: 18 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}>
            <div className="row spread" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{t("landing.demoTitle")}</h3>
              <button className="btn ghost sm" onClick={() => setTime(0)}><RotateCcw size={15} /> {t("landing.replay")}</button>
            </div>
            {runs ? (
              <TurnArena runs={runs} target={90} time={time} />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card flat" style={{ aspectRatio: "0.82", background: "var(--surface-2)" }} />
                ))}
              </div>
            )}
            {stats.length > 0 && (
              <div className="small num" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginTop: 10, textAlign: "center" }}>
                {stats.map((s) => (
                  <div key={s.id}><strong>{Math.round(s.ms)} ms</strong> <span className="muted" style={{ whiteSpace: "nowrap" }}>{s.err >= 0 ? "+" : ""}{s.err.toFixed(1)}°</span></div>
                ))}
              </div>
            )}
            <p className="tiny muted" style={{ margin: "10px 0 0" }}>{t("landing.demoNote")}</p>
          </motion.div>
        </div>
      </section>

      <section className="page">
        <div className="grid-4">
          {features.map((f, i) => (
            <motion.div key={f.t} className="card" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.t}</h3>
              <p className="muted small" style={{ margin: 0 }}>{f.d}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid-2" style={{ marginTop: 48, alignItems: "center", gap: 32 }}>
          <div>
            <h2>{t("landing.howTitle")}</h2>
            <p className="muted">{t("landing.howText")}</p>
            <p className="muted">{t("landing.howK")}</p>
          </div>
          <div className="stack">
            <div className="formula">
              <div className="muted tiny">robot model</div>
              dω/dt = a·ω + b·u
            </div>
            <div className="formula">
              <div className="muted tiny">cost the robot minimises</div>
              J = ∫ (q₁·e² + q₂·(de/dt)² + r·u²) dt
            </div>
            <div className="formula" style={{ borderColor: "var(--c-lqr)" }}>
              <div className="muted tiny">LQR law in turn_lqr()</div>
              u = K1·e + K2·de/dt &nbsp;&nbsp; K1 = √(q₁/r)
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 48, textAlign: "center", padding: 32, background: "var(--glow-soft)", borderColor: "color-mix(in srgb, var(--glow) 40%, transparent)" }}>
          <h2>{t("landing.ctaRegister")}</h2>
          <p className="muted" style={{ maxWidth: 560, margin: "0 auto 18px" }}>{t("landing.f4d")}</p>
          <Link to="/register" className="btn primary lg">{t("landing.ctaRegister")} <ArrowRight size={18} /></Link>
        </div>
      </section>

      <footer className="footer">
        <div className="row spread wrap" style={{ maxWidth: 1240, margin: "0 auto" }}>
          <span>{t("landing.madeBy")} FIRST® LEGO® League, SPIKE™ and Pybricks are trademarks of their owners; this site is not affiliated with them.</span>
          <span className="row" style={{ gap: 14 }}>
            {t("landing.follow")}
            {SOCIAL.instagram && (
              <a href={SOCIAL.instagram} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}><AtSign size={16} /> Instagram</a>
            )}
            {SOCIAL.tiktok && (
              <a href={SOCIAL.tiktok} target="_blank" rel="noreferrer">TikTok</a>
            )}
          </span>
        </div>
      </footer>
    </main>
  );
}
