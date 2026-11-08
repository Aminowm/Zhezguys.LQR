import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowUpRight, ArrowUpLeft, Code2, LayoutGrid, Lock, RotateCcw, GitCompareArrows, AtSign, Bot, Box, Music2 } from "lucide-react";
import { useT } from "../i18n";
import { DEFAULT_PROFILE } from "../sim/robot";
import { tuneRobot } from "../tuning/client";
import { TurnArena, ArenaRun } from "../components/Arena";
import Shards from "../components/Shards";
import { BrandMark } from "../components/Brand";
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
        pick("pid", "PID", "var(--c-pid)", res.pid.before.runs[0].trace),
        pick("gyro", "Gyro", "var(--c-gyro)", res.db.before.runs[0].trace),
      ]);
      setStats([
        { id: "lqr", ms: res.lqr.after.runs[0].returnMs, err: res.lqr.after.runs[0].finalError },
        { id: "pid", ms: res.pid.before.runs[0].returnMs, err: res.pid.before.runs[0].finalError },
        { id: "gyro", ms: res.db.before.runs[0].returnMs, err: res.db.before.runs[0].finalError },
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
    { icon: <Box size={20} />, t: t("landing.f2t"), d: t("landing.f2d") },
    { icon: <LayoutGrid size={20} />, t: t("landing.f3t"), d: t("landing.f3d") },
    { icon: <Lock size={20} />, t: t("landing.f4t"), d: t("landing.f4d") },
  ];
  const lqr = stats.find((s) => s.id === "lqr");

  return (
    <main>
      <section className="hero">
        <motion.div className="hero-window" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Shards className="hero-shards" />
          <div className="hero-top">
            <Link to="/register" className="btn lg" style={{ background: "rgba(255,255,255,0.9)", borderColor: "transparent", color: "var(--navy)" }}>
              <ArrowUpLeft size={18} /> {t("landing.ctaRegister")}
            </Link>
            <div className="hero-notch" aria-hidden>
              <div><span className="k">{t("landing.notchMethod")}</span><strong>LQR</strong></div>
              <div><span className="k">{t("landing.notchRobot")}</span><strong>SPIKE Prime</strong></div>
              <div><span className="k">{t("landing.notchSeason")}</span><strong>BIOGLOW</strong></div>
            </div>
            <Link to="/compare" className="btn lg" style={{ background: "rgba(255,255,255,0.9)", borderColor: "transparent", color: "var(--navy)" }}>
              {t("landing.ctaCompare")} <ArrowUpRight size={18} />
            </Link>
          </div>

          <div className="hero-body">
            <nav className="hero-rail" aria-label="Quick links">
              <a href="#/" className="on" aria-label="Home"><BrandMark size={30} /></a>
              <Link to="/compare" aria-label={t("nav.compare")} title={t("nav.compare")}><GitCompareArrows size={18} /></Link>
              <Link to="/register" aria-label={t("nav.robot")} title={t("nav.robot")}><Bot size={18} /></Link>
              <Link to="/register" aria-label={t("nav.table")} title={t("nav.table")}><LayoutGrid size={18} /></Link>
              {SOCIAL.instagram && <a href={SOCIAL.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram"><AtSign size={18} /></a>}
              {SOCIAL.tiktok && <a href={SOCIAL.tiktok} target="_blank" rel="noreferrer" aria-label="TikTok" title="TikTok"><Music2 size={18} /></a>}
            </nav>

            <div className="stack" style={{ gap: 18 }}>
              <div className="eyebrow" style={{ background: "rgba(255,255,255,0.85)", color: "var(--navy)", alignSelf: "flex-start", marginBottom: 0 }}>{t("landing.eyebrow")}</div>
              <h1 className="hero-title">{t("landing.title")}</h1>
              <p className="hero-lead">{t("landing.lead")}</p>
              <div className="hero-white" style={{ maxWidth: 440 }}>
                <h3 style={{ marginBottom: 6 }}>{t("landing.whiteTitle")}</h3>
                <p className="small muted" style={{ margin: "0 0 14px" }}>{t("landing.whiteText")}</p>
                <div className="row spread">
                  <div>
                    <div className="hero-big num">{lqr ? `±${Math.abs(lqr.err).toFixed(1)}°` : "±0.3°"}</div>
                    <div className="tiny muted" style={{ fontWeight: 600 }}>{t("landing.whiteStat")}</div>
                  </div>
                  <div className="row" style={{ gap: 0 }}>
                    {["var(--c-lqr)", "var(--c-pid)", "var(--c-gyro)"].map((c, i) => (
                      <span key={c} style={{ width: 40, height: 40, borderRadius: "50%", background: c, border: "3px solid #fff", marginLeft: i ? -12 : 0 }} />
                    ))}
                    <Link to="/compare" className="round-arrow" style={{ marginLeft: 8 }} aria-label={t("landing.ctaCompare")}><ArrowUpRight size={18} /></Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="stack" style={{ gap: 14 }}>
              <div className="hero-glass">
                <div className="row spread" style={{ marginBottom: 10 }}>
                  <h3 style={{ margin: 0, color: "inherit" }}>{t("landing.demoTitle")}</h3>
                  <button className="btn sm" style={{ background: "rgba(255,255,255,0.85)", borderColor: "transparent", color: "var(--navy)" }} onClick={() => setTime(0)}>
                    <RotateCcw size={14} /> {t("landing.replay")}
                  </button>
                </div>
                {runs ? (
                  <TurnArena runs={runs} target={90} time={time} />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="card flat" style={{ aspectRatio: "0.8", background: "rgba(255,255,255,0.5)" }} />
                    ))}
                  </div>
                )}
                {stats.length > 0 && (
                  <div className="small num" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginTop: 10, textAlign: "center" }}>
                    {stats.map((s) => (
                      <div key={s.id}><strong>{Math.round(s.ms)} ms</strong> <span style={{ whiteSpace: "nowrap", opacity: 0.75 }}>{s.err >= 0 ? "+" : ""}{s.err.toFixed(1)}°</span></div>
                    ))}
                  </div>
                )}
                <p className="tiny" style={{ margin: "10px 0 0", opacity: 0.8 }}>{t("landing.demoNote")}</p>
              </div>
              <div className="row" style={{ gap: 14, alignItems: "center" }}>
                <div className="hero-badge" aria-hidden><BrandMark size={58} /></div>
                <div className="hero-glass" style={{ flex: 1, padding: "14px 18px" }}>
                  <div className="row spread">
                    <div>
                      <strong style={{ fontFamily: "var(--display)" }}>Zhezguys</strong>
                      <div className="tiny" style={{ opacity: 0.8 }}>{t("landing.madeBy")}</div>
                    </div>
                    <Link to="/register" className="round-arrow" aria-label={t("landing.ctaRegister")}><ArrowUpRight size={18} /></Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
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

        <div className="card" style={{ marginTop: 48, textAlign: "center", padding: 36, position: "relative", overflow: "hidden" }}>
          <h2>{t("landing.ctaRegister")}</h2>
          <p className="muted" style={{ maxWidth: 560, margin: "0 auto 18px" }}>{t("landing.f4d")}</p>
          <Link to="/register" className="btn primary lg">{t("landing.ctaRegister")} <ArrowUpRight size={18} /></Link>
        </div>
      </section>

      <footer className="footer">
        <div className="row spread wrap" style={{ maxWidth: 1280, margin: "0 auto" }}>
          <span>{t("landing.madeBy")} FIRST® LEGO® League, SPIKE™ and Pybricks are trademarks of their owners; this site is not affiliated with them.</span>
          <span className="row" style={{ gap: 14 }}>
            {t("landing.follow")}
            {SOCIAL.instagram && (
              <a href={SOCIAL.instagram} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}><AtSign size={16} /> Instagram</a>
            )}
            {SOCIAL.tiktok && (
              <a href={SOCIAL.tiktok} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}><Music2 size={16} /> TikTok</a>
            )}
          </span>
        </div>
      </footer>
    </main>
  );
}

