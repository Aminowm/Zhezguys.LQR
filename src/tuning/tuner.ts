// Robot page "auto-tune":
//  • LQR needs no guessing: its gains come from the robot model (Riccati),
//    we only show what they are and how the robot will behave.
//  • PID gains have to be searched — we try many in the simulator.
//  • For the Pybricks gyro the team can only change turn rate / acceleration.

import { breakawayTurnPower, derive, RobotProfile } from "../sim/robot";
import {
  GYRO_DEFAULT, GyroSettings, LQR_DEFAULT, LqrSettings, lqrGains, modelConstants, ModelConstants, PID_DEFAULT, PidSettings, PRESETS,
  simGyroStraight, simGyroTurn, simLqrStraight, simLqrTurn, simPidStraight, simPidTurn, TurnMetrics,
} from "./controllers";

export interface YawModel {
  a: number;
  b: number;
  steadyRate: number;
  timeConstant: number;
  breakaway: number;
  inertia: number;
}

export function yawModel(p: RobotProfile): YawModel {
  const d = derive(p);
  return { a: d.yawA, b: d.yawB, steadyRate: -d.yawB / d.yawA, timeConstant: -1 / d.yawA, breakaway: breakawayTurnPower(p), inertia: d.Jeff };
}

export const TURN_SET = [90, -45, 180, 30];
export const STRAIGHT_SET = [600, 1200];

export interface TurnScore {
  cost: number;
  meanTime: number;
  meanOvershoot: number;
  meanFinalError: number;
  maxFinalError: number;
  timeouts: number;
  runs: TurnMetrics[];
}

export function scoreTurns(runs: TurnMetrics[]): TurnScore {
  let cost = 0, t = 0, o = 0, fe = 0, fm = 0, timeouts = 0;
  for (const r of runs) {
    const err = Math.abs(r.finalError);
    t += r.returnMs;
    o += r.overshoot;
    fm += err;
    fe = Math.max(fe, err);
    if (r.timedOut) timeouts++;
    cost += r.returnMs / 1000 + 0.06 * r.overshoot + 1.5 * Math.max(0, err - 0.3) + (r.timedOut ? 2 : 0);
  }
  const n = runs.length;
  return { cost: cost / n, meanTime: t / n, meanOvershoot: o / n, meanFinalError: fm / n, maxFinalError: fe, timeouts, runs };
}

function nelderMead(f: (x: number[]) => number, x0: number[], iters = 50, step = 0.35) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    x[i] += step;
    simplex.push(x);
  }
  let vals = simplex.map(f);
  for (let k = 0; k < iters; k++) {
    const order = vals.map((v, i) => [v, i]).sort((A, B) => A[0] - B[0]).map((q) => q[1]);
    simplex = order.map((i) => simplex[i]);
    vals = order.map((i) => vals[i]);
    const cen = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const refl = cen.map((c, j) => c + (c - worst[j]));
    const fr = f(refl);
    if (fr < vals[0]) {
      const exp = cen.map((c, j) => c + 2 * (c - worst[j]));
      const fe = f(exp);
      if (fe < fr) [simplex[n], vals[n]] = [exp, fe];
      else [simplex[n], vals[n]] = [refl, fr];
    } else if (fr < vals[n - 1]) [simplex[n], vals[n]] = [refl, fr];
    else {
      const con = cen.map((c, j) => c + 0.5 * (worst[j] - c));
      const fc = f(con);
      if (fc < vals[n]) [simplex[n], vals[n]] = [con, fc];
      else
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          vals[i] = f(simplex[i]);
        }
    }
  }
  const best = vals.indexOf(Math.min(...vals));
  return { x: simplex[best], f: vals[best] };
}

export interface LqrResult {
  model: ModelConstants;
  gains: { turn: [number, number]; drive: [number, number]; hold: [number, number] };
  zeta: number;
  score: TurnScore;
}

export function lqrResult(p: RobotProfile, L: LqrSettings = LQR_DEFAULT): LqrResult {
  const m = modelConstants(p);
  const turn = lqrGains(m.YAW_A, m.YAW_B, L.TURN_E_MAX, L.TURN_RATE_MAX, 100);
  const drive = lqrGains(m.LIN_A, m.LIN_B, L.DRIVE_E_MAX, L.DRIVE_V_MAX, 60);
  const hold = lqrGains(m.YAW_A, m.YAW_B, L.HOLD_E_MAX, L.HOLD_RATE_MAX, 40);
  const c1 = -m.YAW_A + m.YAW_B * turn[1];
  const zeta = c1 / (2 * Math.sqrt(m.YAW_B * turn[0]));
  return { model: m, gains: { turn, drive, hold }, zeta, score: scoreTurns(TURN_SET.map((a, i) => simLqrTurn(p, a, 100, L, 11 + i))) };
}

export interface PidTuneResult {
  params: PidSettings;
  before: TurnScore;
  after: TurnScore;
}

export function tunePid(p: RobotProfile, current: PidSettings = PID_DEFAULT): PidTuneResult {
  const minP = Math.min(30, Math.max(6, Math.ceil(breakawayTurnPower(p) + 1.5)));
  const runSet = (prm: PidSettings) => scoreTurns(TURN_SET.map((a, i) => simPidTurn(p, a, 100, prm, 11 + i)));
  const before = runSet(current);
  const mk = (x: number[]): PidSettings => ({ ...current, PID_KP: Math.exp(x[0]), PID_KD: Math.exp(x[1]), PID_KI: Math.max(0, Math.exp(x[2]) - 0.01), PID_MINPOWER: minP });
  const res = nelderMead((x) => {
    const prm = mk(x);
    if (prm.PID_KP > 40 || prm.PID_KD > 2 || prm.PID_KI > 20) return 99;
    return runSet(prm).cost;
  }, [Math.log(current.PID_KP), Math.log(Math.max(0.01, current.PID_KD)), Math.log(Math.max(0, current.PID_KI) + 0.01)], 45);
  const params = mk(res.x);
  return { params, before, after: runSet(params) };
}

export interface GyroTuneResult {
  params: GyroSettings;
  before: TurnScore;
  after: TurnScore;
}

export function tuneGyro(p: RobotProfile, current: GyroSettings = GYRO_DEFAULT): GyroTuneResult {
  const d = derive(p);
  const runSet = (prm: GyroSettings) => scoreTurns(TURN_SET.map((a, i) => simGyroTurn(p, a, 100, prm, 11 + i)));
  const before = runSet(current);
  let best = current;
  let bestCost = before.cost;
  for (const rate of [150, 216, 300, 400, 500, 600])
    for (const acc of [600, 1000, 1500, 2200, 3000]) {
      if (rate > d.wMaxDeg * 0.85) continue;
      const c = runSet({ GYRO_TURN_RATE: rate, GYRO_TURN_ACC: acc }).cost;
      if (c < bestCost) {
        bestCost = c;
        best = { GYRO_TURN_RATE: rate, GYRO_TURN_ACC: acc };
      }
    }
  return { params: best, before, after: runSet(best) };
}

export interface StraightScore {
  lateral: number; // mean |side drift| mm
  dist: number; // mean |distance error| mm
  heading: number; // mean |heading error| deg
  ms: number;
}

function straightScore(runs: { lateralMm: number; distErr: number; headingError: number; returnMs: number }[]): StraightScore {
  const n = runs.length;
  return {
    lateral: runs.reduce((s, r) => s + Math.abs(r.lateralMm), 0) / n,
    dist: runs.reduce((s, r) => s + Math.abs(r.distErr), 0) / n,
    heading: runs.reduce((s, r) => s + Math.abs(r.headingError), 0) / n,
    ms: runs.reduce((s, r) => s + r.returnMs, 0) / n,
  };
}

export interface FullTune {
  lqr: LqrResult;
  pid: PidTuneResult;
  gyro: GyroTuneResult;
  straight: { lqr: StraightScore; pid: StraightScore; gyro: StraightScore };
  ms: number;
}

export interface TuneInputs {
  lqr?: LqrSettings;
  pid?: PidSettings;
  gyro?: GyroSettings;
}

export function tuneAll(p: RobotProfile, cur: TuneInputs = {}): FullTune {
  const t0 = performance.now();
  const lqr = lqrResult(p, cur.lqr ?? LQR_DEFAULT);
  const pid = tunePid(p, cur.pid ?? PID_DEFAULT);
  const gyro = tuneGyro(p, cur.gyro ?? GYRO_DEFAULT);
  const straight = {
    lqr: straightScore(STRAIGHT_SET.map((mm, i) => simLqrStraight(p, mm, PRESETS.NORMAL, cur.lqr ?? LQR_DEFAULT, 21 + i))),
    pid: straightScore(STRAIGHT_SET.map((mm, i) => simPidStraight(p, mm, PRESETS.NORMAL, cur.pid ?? PID_DEFAULT, 21 + i))),
    gyro: straightScore(STRAIGHT_SET.map((mm, i) => simGyroStraight(p, mm, PRESETS.NORMAL, 21 + i))),
  };
  return { lqr, pid, gyro, straight, ms: performance.now() - t0 };
}
