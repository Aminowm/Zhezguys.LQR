import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowUpRight, Code2, LayoutGrid, Lock, RotateCcw, GitCompareArrows, AtSign, Box, Music2 } from "lucide-react";
import { useT } from "../i18n";
import { DEFAULT_PROFILE } from "../sim/robot";
import { tuneRobot } from "../tuning/client";
import { TurnArena, ArenaRun } from "../components/Arena";
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
        pick("lqr", "LQR", "var(--c-lqr)", res.lqr.score.runs[0].trace),
        pick("pid", "PID", "var(--c-pid)", res.pid.before.runs[0].trace),
        pick("gyro", "Gyro", "var(--c-gyro)", res.gyro.before.runs[0].trace),
      ]);
      setStats([
        { id: "lqr", ms: res.lqr.score.runs[0].returnMs, err: res.lqr.score.runs[0].finalError },
        { id: "pid", ms: res.pid.before.runs[0].returnMs, err: res.pid.before.runs[0].finalError },
        { id: "gyro", ms: res.gyro.before.runs[0].returnMs, err: res.gyro.before.runs[0].finalError },
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
  const [w1, ...rest] = t("landing.title").split(" ");

  return (
    <main className="ed">
      <div className="ed-meta" aria-hidden>
        <div><span>(01)</span><span>LQR Lab</span></div>
        <div><span className="k">{t("landing.notchMethod")}</span><span>LQR · PID · Gyro</span></div>
        <div><span className="k">{t("landing.notchRobot")}</span><span>SPIKE Prime</span></div>
        <div><span className="k">{t("landing.notchSeason")}</span><span>BIOGLOW</span></div>
      </div>

      <section className="ed-hero">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <div className="eyebrow">{t("landing.eyebrow")}</div>
          <h1 className="ed-title">
            {w1} <span className="sky">{rest.join(" ")}</span>
          </h1>
          <p className="ed-lead">{t("landing.lead")}</p>
          <div className="row wrap" style={{ marginTop: 22, gap: 10 }}>
            <Link to="/register" className="btn primary lg">{t("landing.ctaRegister")} <ArrowUpRight size={18} /></Link>
            <Link to="/compare" className="btn lg">{t("landing.ctaCompare")} <GitCompareArrows size={18} /></Link>
          </div>
          <div className="row wrap small" style={{ marginTop: 26, gap: 18, color: "var(--muted)" }}>
            <span className="row" style={{ gap: 8 }}><BrandMark size={26} /> {t("landing.madeBy")}</span>
            {SOCIAL.instagram && <a href={SOCIAL.instagram} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}><AtSign size={16} /> Instagram</a>}
            {SOCIAL.tiktok && <a href={SOCIAL.tiktok} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}><Music2 size={16} /> TikTok</a>}
          </div>
        </motion.div>

        <motion.div className="stack" style={{ gap: 14 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }}>
          <div className="ed-panel">
            <div className="row spread" style={{ marginBottom: 10 }}>
              <span className="label" style={{ color: "inherit" }}>{t("landing.demoTitle")}</span>
              <button className="btn sm" onClick={() => setTime(0)}>
                <RotateCcw size={14} /> {t("landing.replay")}
              </button>
            </div>
            {runs ? (
              <TurnArena runs={runs} target={90} time={time} />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ aspectRatio: "0.8", background: "color-mix(in srgb, var(--surface-solid) 55%, transparent)", borderRadius: 4 }} />
                ))}
              </div>
            )}
            {stats.length > 0 && (
              <div className="ed-stats num small">
                {stats.map((s) => (
                  <div key={s.id}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="dot" style={{ background: `var(--c-${s.id})` }} />
                      <strong>{s.id === "gyro" ? "Gyro" : s.id.toUpperCase()}</strong>
                    </div>
                    <div>{Math.round(s.ms)} ms · {s.err >= 0 ? "+" : ""}{s.err.toFixed(2)}°</div>
                  </div>
                ))}
              </div>
            )}
            <p className="tiny" style={{ margin: "12px 0 0" }}>{t("landing.demoNote")}</p>
          </div>
          <div className="row spread wrap" style={{ gap: 14, alignItems: "flex-end" }}>
            <div>
              <div className="ed-figure num">{lqr ? `±${Math.abs(lqr.err).toFixed(2)}°` : "±0.1°"}</div>
              <div className="small muted">{t("landing.whiteStat")}</div>
            </div>
            <p className="small muted" style={{ maxWidth: 300, margin: 0 }}>{t("landing.whiteText")}</p>
          </div>
        </motion.div>
      </section>

      <section className="ed-section">
        <header>
          <span className="ed-no">02</span>
          <h2>{t("landing.whiteTitle")}</h2>
        </header>
        <div className="ed-body">
          <div className="ed-cells">
            {features.map((f, i) => (
              <motion.div key={f.t} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
                <div className="row spread">
                  <span className="ed-no">02.{i + 1}</span>
                  <span className="feature-icon" style={{ marginBottom: 0 }}>{f.icon}</span>
                </div>
                <h3>{f.t}</h3>
                <p className="muted small" style={{ margin: 0 }}>{f.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="ed-section">
        <header>
          <span className="ed-no">03</span>
          <h2>{t("landing.howTitle")}</h2>
        </header>
        <div className="ed-body grid-2" style={{ gap: 28, alignItems: "start" }}>
          <div>
            <p className="ed-lead" style={{ marginTop: 0 }}>{t("landing.howText")}</p>
            <p className="muted">{t("landing.howK")}</p>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <div className="formula">
              <div className="muted tiny">{t("landing.fModel")}</div>
              dω/dt = YAW_A·ω + YAW_B·u
            </div>
            <div className="formula">
              <div className="muted tiny">{t("landing.fCost")}</div>
              J = ∫ (e²/e_max² + ω²/ω_max² + u²/u_max²) dt
            </div>
            <div className="formula" style={{ background: "var(--sky)", color: "var(--sky-ink)", borderColor: "transparent" }}>
              <div className="tiny" style={{ opacity: 0.75 }}>lqr_turn()</div>
              u = K1·e − K2·ω + Ki·∫e + u₀·e/(|e|+0.3)
            </div>
          </div>
        </div>
      </section>

      <section className="ed-cta">
        <div>
          <span className="ed-no">04</span>
          <h2>{t("landing.ctaRegister")}</h2>
          <p style={{ margin: "10px 0 0", maxWidth: 560 }}>{t("landing.f4d")}</p>
        </div>
        <Link to="/register" className="btn primary lg">{t("nav.register")} <ArrowUpRight size={18} /></Link>
      </section>

      <footer className="footer" style={{ marginTop: 26, paddingLeft: 0, paddingRight: 0 }}>
        <div className="row spread wrap">
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
