// Read and write the settings constants in the team's code files
// (PID_KP = 3.0, GYRO_TURN_RATE = 180, YAW_B = 50.2 …).
import type { CodeFileId } from "./defaults";
import type { RobotProfile } from "../sim/robot";
import { GYRO_DEFAULT, GyroSettings, LQR_DEFAULT, LqrSettings, modelConstants, PID_DEFAULT, PidSettings } from "../tuning/controllers";

/** Evaluate tiny arithmetic like "50 * 3.6" (digits and + - * / ( ) only). */
export function evalSimple(expr: string): number | null {
  const s = expr.trim();
  if (!s || !/^[\d.\s*+\-/()eE]+$/.test(s)) return null;
  try {
    const v = Function(`"use strict"; return (${s});`)();
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Value of a top-level `NAME = number` line, or null. */
export function readConstant(src: string, name: string): number | null {
  const m = src.match(new RegExp(`^${name}\\s*=\\s*([^#\\n]+)`, "m"));
  return m ? evalSimple(m[1]) : null;
}

/** Replace the numbers of top-level `NAME = number` lines; comments are kept. */
export function applyConstants(src: string, values: Record<string, number>, digits = 3) {
  let out = src;
  const changed: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^(${k}\\s*=\\s*)([^#\\n]*?)(\\s*(#.*)?)$`, "m");
    if (re.test(out)) {
      const val = Number.isInteger(v) ? String(v) : String(+v.toFixed(digits));
      out = out.replace(re, (_m, a, _b, c) => `${a}${val}${c ?? ""}`);
      changed.push(k);
    }
  }
  return { src: out, changed };
}

function readAll<T extends object>(src: string, defaults: T): T {
  const out = { ...defaults } as Record<string, number>;
  for (const k of Object.keys(defaults)) {
    const v = readConstant(src, k);
    if (v !== null) out[k] = v;
  }
  return out as T;
}

export interface CurrentSettings {
  lqr: LqrSettings;
  pid: PidSettings;
  gyro: GyroSettings;
}

export function currentSettings(files: Record<CodeFileId, string>): CurrentSettings {
  return {
    lqr: readAll(files.lqr, LQR_DEFAULT),
    pid: readAll(files.pid, PID_DEFAULT),
    gyro: readAll(files.config, GYRO_DEFAULT),
  };
}

/** Write the robot model (from the 3D builder) into the "site" lines of config.py. */
export function applyModel(config: string, p: RobotProfile) {
  return applyConstants(config, modelConstants(p) as unknown as Record<string, number>, 2).src;
}

/** True when the files use the current library (straight / turn / turn_one). */
export function hasNewApi(files: Record<CodeFileId, string>) {
  return /def\s+turn\s*\(/.test(files.helpers) && /def\s+lqr_turn\s*\(/.test(files.lqr) && /def\s+pid_turn\s*\(/.test(files.pid);
}
