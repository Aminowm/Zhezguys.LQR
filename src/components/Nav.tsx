import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Code2, GitCompareArrows, LayoutGrid, LogOut, Moon, Sun, Users, Languages, ChevronDown, Check } from "lucide-react";
import { useApp } from "../state/app";
import { LANGS, useLang, useT } from "../i18n";
import { BrandMark } from "./Brand";

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [ref, close]);
}

function LangMenu() {
  const { lang, setLang } = useLang();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn ghost sm" aria-haspopup="menu" aria-expanded={open} aria-label={t("nav.language")} onClick={() => setOpen((o) => !o)}>
        <Languages size={16} /> {LANGS.find((l) => l.id === lang)?.short}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="menu" role="menu" style={{ minWidth: 170 }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            {LANGS.map((l) => (
              <button key={l.id} role="menuitemradio" aria-checked={l.id === lang} onClick={() => { setLang(l.id); setOpen(false); }}>
                <span style={{ width: 16 }}>{l.id === lang && <Check size={16} />}</span>
                {l.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useApp();
  const t = useT();
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button className="icon-btn" aria-label={t("nav.theme")} title={t("nav.theme")} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function AccountMenu() {
  const { session, logout } = useApp();
  const t = useT();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  if (!session) return null;
  const initials = (session.user.firstName[0] ?? "") + (session.user.lastName[0] ?? "");
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn ghost sm" aria-haspopup="menu" aria-expanded={open} aria-label={t("nav.account")} onClick={() => setOpen((o) => !o)}>
        <span className="pill" style={{ background: "var(--primary-soft)", color: "var(--primary)", borderColor: "transparent" }}>{initials.toUpperCase()}</span>
        <span className="small" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{session.team.name}</span>
        <ChevronDown size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="menu" role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <div style={{ padding: "8px 10px 10px" }}>
              <div style={{ fontWeight: 600 }}>{session.user.firstName} {session.user.lastName}</div>
              <div className="tiny muted">{session.user.email}</div>
            </div>
            <Link to="/team" onClick={() => setOpen(false)}><Users size={16} /> {t("nav.team")}</Link>
            <button onClick={async () => { setOpen(false); await logout(); nav("/"); }}><LogOut size={16} /> {t("nav.logout")}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Nav() {
  const session = useApp((s) => s.session);
  const t = useT();
  const link = (to: string, icon: ReactElement, label: string) => (
    <NavLink to={to} className={({ isActive }) => "nav-link" + (isActive ? " active" : "")} title={label}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to={session ? "/table" : "/"} className="brand">
          <BrandMark />
          Zhezguys <small>LQR Lab</small>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {session ? (
            <>
              {link("/table", <LayoutGrid size={17} />, t("nav.table"))}
              {link("/code", <Code2 size={17} />, t("nav.code"))}
              {link("/robot", <Bot size={17} />, t("nav.robot"))}
              {link("/compare", <GitCompareArrows size={17} />, t("nav.compare"))}
            </>
          ) : (
            link("/compare", <GitCompareArrows size={17} />, t("nav.compare"))
          )}
        </nav>
        <div className="nav-right">
          <LangMenu />
          <ThemeToggle />
          {session ? (
            <AccountMenu />
          ) : (
            <>
              <Link to="/login" className="btn ghost sm">{t("nav.login")}</Link>
              <Link to="/register" className="btn primary sm hide-sm">{t("nav.register")}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
