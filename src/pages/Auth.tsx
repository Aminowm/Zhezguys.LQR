import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Cloud, HardDrive, Loader2, UserPlus, LogIn, Users, Plus, ArrowLeft, ArrowRight } from "lucide-react";
import RobotBuilder from "../components/RobotBuilder";
import { applyBuild, defaultBuild, RobotBuild } from "../robot/build";
import { DEFAULT_PROFILE } from "../sim/robot";
import { useApp, isCloud } from "../state/app";
import { useT, DictKey } from "../i18n";
import { AuthError, storage } from "../storage";
import { BrandMark } from "../components/Brand";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

function ModeNote() {
  const t = useT();
  return (
    <div className="banner small" style={{ marginTop: 16 }}>
      {isCloud ? <Cloud size={18} /> : <HardDrive size={18} />}
      <span>{isCloud ? t("auth.cloudMode") : t("auth.localMode")}</span>
    </div>
  );
}

function errText(t: ReturnType<typeof useT>, e: unknown) {
  if (e instanceof AuthError) {
    const key = `auth.err.${e.code}` as DictKey;
    return t(key, { msg: e.message });
  }
  return t("auth.err.network", { msg: String((e as Error)?.message ?? e) });
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  inputMode?: "text" | "email";
  maxLength?: number;
  upper?: boolean;
}) {
  const errId = props.id + "-err";
  const hintId = props.id + "-hint";
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        className="input"
        type={props.type ?? "text"}
        value={props.value}
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        aria-invalid={!!props.error}
        aria-describedby={props.error ? errId : props.hint ? hintId : undefined}
        onChange={(e) => props.onChange(props.upper ? e.target.value.toUpperCase() : e.target.value)}
        style={props.upper ? { letterSpacing: "0.2em", fontFamily: "var(--mono)" } : undefined}
      />
      {props.error ? (
        <span id={errId} className="err">{props.error}</span>
      ) : props.hint ? (
        <span id={hintId} className="hint">{props.hint}</span>
      ) : null}
    </div>
  );
}

export function RegisterPage() {
  const t = useT();
  const register = useApp((s) => s.register);
  const nav = useNavigate();
  const [f, setF] = useState({ firstName: "", lastName: "", teamName: "", joinCode: "", email: "", password: "" });
  const [mode, setMode] = useState<"create" | "join">("create");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [teamPreview, setTeamPreview] = useState<string | null | undefined>(undefined);
  const [confirmSent, setConfirmSent] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [build, setBuild] = useState<RobotBuild>(defaultBuild);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (mode !== "join" || f.joinCode.trim().length < 6) {
      setTeamPreview(undefined);
      return;
    }
    let live = true;
    storage.lookupTeam(f.joinCode).then((n) => live && setTeamPreview(n));
    return () => {
      live = false;
    };
  }, [mode, f.joinCode]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.firstName.trim()) e.firstName = t("auth.err.required");
    if (!f.lastName.trim()) e.lastName = t("auth.err.required");
    if (mode === "create" && !f.teamName.trim()) e.teamName = t("auth.err.team_required");
    if (mode === "join" && f.joinCode.trim().length < 6) e.joinCode = t("auth.err.required");
    if (!emailOk(f.email)) e.email = t("auth.err.email");
    if (f.password.length < 8) e.password = t("auth.err.password");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const finish = async () => {
    setBusy(true);
    setFormErr("");
    try {
      const robot = mode === "create" ? applyBuild({ ...DEFAULT_PROFILE, name: f.teamName.trim() || "My robot" }, build) : undefined;
      const res = await register({ ...f, mode }, robot);
      if (res.needsConfirm) setConfirmSent(true);
      else nav("/table");
    } catch (e) {
      setStep(1);
      if (e instanceof AuthError && e.code === "bad_code") setErrors({ joinCode: t("auth.err.bad_code") });
      else if (e instanceof AuthError && e.code === "email_taken") setErrors({ email: t("auth.err.email_taken") });
      else setFormErr(errText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormErr("");
    if (!validate()) return;
    if (mode === "create") {
      setStep(2);
      window.scrollTo({ top: 0 });
      return;
    }
    await finish();
  };

  const stepper = (
    <div className="stepper" aria-label="Steps">
      <span className={"s" + (step === 1 ? " on" : "")}><span className="n">1</span>{t("auth.step1")}</span>
      {mode === "create" && (
        <>
          <span aria-hidden>—</span>
          <span className={"s" + (step === 2 ? " on" : "")}><span className="n">2</span>{t("auth.step2")}</span>
        </>
      )}
    </div>
  );

  if (confirmSent)
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <h2>{t("auth.registerTitle")}</h2>
          <p>{t("auth.checkEmail", { email: f.email })}</p>
          <Link className="btn primary" to="/login">{t("nav.login")}</Link>
        </div>
      </div>
    );

  if (step === 2)
    return (
      <div className="page">
        <motion.div className="stack" style={{ gap: 16 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {stepper}
          <div className="row spread wrap">
            <div>
              <h1 style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)", marginBottom: 4 }}>{t("auth.robotTitle")}</h1>
              <p className="muted" style={{ margin: 0, maxWidth: "70ch" }}>{t("auth.robotSub")}</p>
            </div>
            <div className="row">
              <button type="button" className="btn lg" onClick={() => setStep(1)}><ArrowLeft size={18} /> {t("common.back")}</button>
              <button type="button" className="btn primary lg" onClick={finish} disabled={busy}>
                {busy ? <Loader2 size={18} className="spin" /> : <UserPlus size={18} />} {t("auth.createTeamBtn")}
              </button>
            </div>
          </div>
          {formErr && <div className="banner error" role="alert">{formErr}</div>}
          <div className="card">
            <RobotBuilder value={build} onChange={setBuild} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn primary lg" onClick={finish} disabled={busy}>
              {busy ? <Loader2 size={18} className="spin" /> : <UserPlus size={18} />} {t("auth.createTeamBtn")}
            </button>
          </div>
        </motion.div>
      </div>
    );

  return (
    <div className="auth-wrap">
      <motion.form className="card auth-card" onSubmit={submit} noValidate initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <BrandMark size={36} />
          <div>
            <h2 style={{ margin: 0 }}>{t("auth.registerTitle")}</h2>
          </div>
        </div>
        <div className="stack" style={{ gap: 14 }}>
          {stepper}
          <div className="grid-2" style={{ gap: 12 }}>
            <Field id="fn" label={t("auth.firstName")} value={f.firstName} onChange={set("firstName")} error={errors.firstName} autoComplete="given-name" autoFocus />
            <Field id="ln" label={t("auth.lastName")} value={f.lastName} onChange={set("lastName")} error={errors.lastName} autoComplete="family-name" />
          </div>
          <div className="seg" role="group" style={{ alignSelf: "flex-start" }}>
            <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")}><Plus size={15} /> {t("auth.createTeam")}</button>
            <button type="button" aria-pressed={mode === "join"} onClick={() => setMode("join")}><Users size={15} /> {t("auth.joinTeam")}</button>
          </div>
          {mode === "create" ? (
            <Field id="tn" label={t("auth.teamName")} value={f.teamName} onChange={set("teamName")} error={errors.teamName} autoComplete="organization" maxLength={80} />
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <Field id="jc" label={t("auth.joinCode")} value={f.joinCode} onChange={set("joinCode")} error={errors.joinCode} hint={t("auth.joinCodeHint")} maxLength={6} upper />
              {teamPreview !== undefined && !errors.joinCode && (
                <span className={teamPreview ? "pill ok" : "pill warn"} style={{ alignSelf: "flex-start" }} role="status">
                  {teamPreview ? t("auth.teamFound", { name: teamPreview }) : t("auth.teamNotFound")}
                </span>
              )}
            </div>
          )}
          <Field id="em" label={t("auth.email")} value={f.email} onChange={set("email")} error={errors.email} type="email" inputMode="email" autoComplete="email" />
          <Field id="pw" label={t("auth.password")} value={f.password} onChange={set("password")} error={errors.password} hint={t("auth.passwordHint")} type="password" autoComplete="new-password" />
          {formErr && <div className="banner error" role="alert">{formErr}</div>}
          <button className="btn primary lg" type="submit" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : mode === "create" ? <ArrowRight size={18} /> : <UserPlus size={18} />} {t("auth.submitRegister")}
          </button>
          <div className="small muted">
            {t("auth.haveAccount")} <Link to="/login">{t("nav.login")}</Link>
          </div>
        </div>
        <ModeNote />
      </motion.form>
    </div>
  );
}

export function LoginPage() {
  const t = useT();
  const login = useApp((s) => s.login);
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setErr("");
    if (!emailOk(email) || !password) {
      setErr(t("auth.err.bad_login"));
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
      nav("/table");
    } catch (e) {
      setErr(errText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-wrap">
      <motion.form className="card auth-card" style={{ maxWidth: 440 }} onSubmit={submit} noValidate initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <BrandMark size={36} />
          <div>
            <h2 style={{ margin: 0 }}>{t("auth.loginTitle")}</h2>
            <div className="small muted">{t("auth.loginSub")}</div>
          </div>
        </div>
        <div className="stack" style={{ gap: 14 }}>
          <Field id="lem" label={t("auth.email")} value={email} onChange={setEmail} type="email" inputMode="email" autoComplete="email" autoFocus />
          <Field id="lpw" label={t("auth.password")} value={password} onChange={setPassword} type="password" autoComplete="current-password" />
          {err && <div className="banner error" role="alert">{err}</div>}
          <button className="btn primary lg" type="submit" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />} {t("auth.submitLogin")}
          </button>
          <div className="small muted">
            {t("auth.noAccount")} <Link to="/register">{t("nav.register")}</Link>
          </div>
        </div>
        <ModeNote />
      </motion.form>
    </div>
  );
}
