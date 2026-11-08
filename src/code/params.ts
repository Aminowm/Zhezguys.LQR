// Read the default values a team currently has in its function signatures,
// so the tuner can start from (and compare against) the team's own code.
import type { CodeFileId } from "./defaults";
import { LQR_DEFAULT, PID_DEFAULT, STRAIGHT_LQR_DEFAULT, LqrTurnParams, PidTurnParams, DbTurnParams, StraightHoldParams } from "../tuning/controllers";

/** Evaluate tiny arithmetic like "50 * 3.6" (digits and + - * / ( ) only). */
export function evalSimple(expr: string): number | null {
  const s = expr.trim();
  if (!/^[\d.\s*+\-/()eE]+$/.test(s)) return null;
  try {
    const v = Function(`"use strict"; return (${s});`)();
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function parseDefaults(src: string, fn: string): Record<string, number> {
  const m = src.match(new RegExp(`def\\s+${fn}\\s*\\(([\\s\\S]*?)\\)\\s*:`));
  const out: Record<string, number> = {};
  if (!m) return out;
  for (const part of m[1].split(",")) {
    const kv = part.split("=");
    if (kv.length !== 2) continue;
    const v = evalSimple(kv[1]);
    if (v !== null) out[kv[0].trim()] = v;
  }
  return out;
}

/** Body of a top-level function (until the next unindented line). */
export function functionBody(src: string, fn: string) {
  const start = src.search(new RegExp(`^def\\s+${fn}\\s*\\(`, "m"));
  if (start < 0) return null;
  const rest = src.slice(start);
  const nl = rest.indexOf("\n");
  if (nl < 0) return { start, end: src.length, text: rest };
  const next = rest.slice(nl + 1).search(/^\S/m);
  const len = next < 0 ? rest.length : nl + 1 + next;
  return { start, end: start + len, text: rest.slice(0, len) };
}

export interface CurrentParams {
  lqr: LqrTurnParams & { Q: number; R: number };
  pid: PidTurnParams;
  db: DbTurnParams;
  straight: StraightHoldParams & { Q: number; R: number };
}

export function currentParams(files: Record<CodeFileId, string>): CurrentParams {
  const l = parseDefaults(files.lqr, "turn_lqr");
  const Q = l.Q ?? 1;
  const R = l.R ?? 0.01;
  const lqr = {
    ...LQR_DEFAULT,
    Q,
    R,
    K1: Math.sqrt(Q / R) / (l.b ?? 2),
    K2: l.kd ?? LQR_DEFAULT.K2,
    Maxpower: l.Maxpower ?? LQR_DEFAULT.Maxpower,
    Minpower: l.Minpower ?? LQR_DEFAULT.Minpower,
    Tolerance: l.Tolerance ?? LQR_DEFAULT.Tolerance,
    Settle: l.Settle ?? LQR_DEFAULT.Settle,
    Timeout: l.Timeout ?? LQR_DEFAULT.Timeout,
  };
  const p = parseDefaults(files.pid, "turn_pid");
  const pid = {
    ...PID_DEFAULT,
    Kp: p.Kp ?? PID_DEFAULT.Kp,
    Ki: p.Ki ?? PID_DEFAULT.Ki,
    Kd: p.Kd ?? PID_DEFAULT.Kd,
    Maxpower: p.Maxpower ?? PID_DEFAULT.Maxpower,
    Minpower: p.Minpower ?? PID_DEFAULT.Minpower,
    Tolerance: p.Tolerance ?? PID_DEFAULT.Tolerance,
    Settle: p.Settle ?? PID_DEFAULT.Settle,
    Timeout: p.Timeout ?? PID_DEFAULT.Timeout,
  };
  const body = functionBody(files.helpers, "turn_gyro")?.text ?? "";
  const rate = evalSimple(body.match(/turn_rate\s*=\s*([^,)\n]+)/)?.[1] ?? "") ?? 180;
  const acc = evalSimple(body.match(/turn_acceleration\s*=\s*([^,)\n]+)/)?.[1] ?? "");
  const db: DbTurnParams = acc ? { turn_rate: rate, turn_acceleration: acc } : { turn_rate: rate };
  const s = parseDefaults(files.lqr, "straight_lqr");
  const sQ = s.Q ?? 1;
  const sR = s.R ?? 0.01;
  const straight = {
    ...STRAIGHT_LQR_DEFAULT,
    Q: sQ,
    R: sR,
    K1: Math.sqrt(sQ / sR) / (s.b ?? 4),
    K2: s.kd ?? STRAIGHT_LQR_DEFAULT.K2!,
    Power: s.Power ?? 60,
    Minpower: s.Minpower ?? STRAIGHT_LQR_DEFAULT.Minpower,
    Accel: s.Accel ?? STRAIGHT_LQR_DEFAULT.Accel,
    Decel: s.Decel ?? STRAIGHT_LQR_DEFAULT.Decel,
  };
  return { lqr, pid, db, straight };
}

/** Write turn_rate / turn_acceleration into the settings() line of turn_gyro. */
export function applyGyroSettings(helpers: string, rate: number, acc: number) {
  const fb = functionBody(helpers, "turn_gyro");
  if (!fb) return helpers;
  const body = fb.text.replace(/Drive_base\.settings\([^)]*\)/, `Drive_base.settings(turn_rate=${Math.round(rate)}, turn_acceleration=${Math.round(acc)})`);
  return helpers.slice(0, fb.start) + body + helpers.slice(fb.end);
}
