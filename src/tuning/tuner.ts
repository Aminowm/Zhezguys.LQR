// Auto-tuner: turns a robot profile into gains for the team's own functions.
//
// 1. Build the yaw model of the robot from its mass, size, wheels and motors:
//      heading'' = a·heading' + b·u        (u = motor power %, heading in degrees)
// 2. Solve the LQR Riccati equation for that model → K1 (error) and K2 (error rate).
// 3. Refine K1/K2 (and PID gains, and DriveBase settings) by running the
//    real control loop in the simulator for several turn angles and keeping
//    the fastest settings that end on target with little overshoot.

import { breakawayTurnPower, derive, RobotProfile } from "../sim/robot";
import {
  LQR_DEFAULT, LqrTurnParams, PID_DEFAULT, PidTurnParams, DbTurnParams,
  simTurnLqr, simTurnPid, simTurnGyro, TurnMetrics, simStraightHold,
  STRAIGHT_LQR_DEFAULT, STRAIGHT_PID_DEFAULT, StraightHoldParams,
} from "./controllers";

export interface YawModel {
  a: number; // 1/s (negative: motors' own braking)
  b: number; // deg/s² per %
  steadyRate: number; // deg/s per % at steady state
  timeConstant: number; // s
  breakaway: number; // % needed to start turning
  inertia: number; // kg·m²
}

export function yawModel(p: RobotProfile): YawModel {
  const d = derive(p);
  return {
    a: d.yawA,
    b: d.yawB,
    steadyRate: -d.yawB / d.yawA,
    timeConstant: -1 / d.yawA,
    breakaway: breakawayTurnPower(p),
    inertia: d.Jeff,
  };
}

export interface LqrWeights {
  q1: number; // weight on heading error
  q2: number; // weight on error rate
  r: number; // weight on motor power
}

/** Bryson's rule: weight = 1 / (largest acceptable value)². */
export function brysonWeights(maxErrorDeg = 15, maxRateDeg = 600, maxPower = 80): LqrWeights {
  return { q1: 1 / (maxErrorDeg * maxErrorDeg), q2: 1 / (maxRateDeg * maxRateDeg), r: 1 / (maxPower * maxPower) };
}

/**
 * Closed-form LQR for x = [e, e'], e'' = a·e' − b·u, u = K1·e + K2·e'.
 * (Continuous algebraic Riccati equation of a 2×2 system.)
 */
export function solveYawLqr(m: YawModel, w: LqrWeights) {
  const { a, b } = m;
  const p2 = Math.sqrt(w.q1 * w.r) / b;
  const K1 = Math.sqrt(w.q1 / w.r);
  const s = a * a + ((b * b) / w.r) * (2 * p2 + w.q2);
  const p3 = (w.r * (a + Math.sqrt(s))) / (b * b);
  const K2 = (b * p3) / w.r;
  // closed-loop poles of the linear model
  const c1 = -a + b * K2;
  const c0 = b * K1;
  const disc = c1 * c1 - 4 * c0;
  const wn = Math.sqrt(c0);
  const zeta = c1 / (2 * wn);
  return { K1, K2, wn, zeta, overdamped: disc >= 0 };
}

const TURN_SET = [90, -45, 180, 30];

export interface TurnScore {
  cost: number;
  meanTime: number;
  meanOvershoot: number;
  maxFinalError: number;
  timeouts: number;
  runs: TurnMetrics[];
}

export function scoreTurns(runs: TurnMetrics[]): TurnScore {
  let cost = 0;
  let t = 0;
  let o = 0;
  let fe = 0;
  let timeouts = 0;
  for (const r of runs) {
    const err = Math.abs(r.finalError);
    t += r.returnMs;
    o += r.overshoot;
    fe = Math.max(fe, err);
    if (r.timedOut) timeouts++;
    cost += r.returnMs / 1000 + 0.06 * r.overshoot + 1.5 * Math.max(0, err - 0.4) + (r.timedOut ? 2 : 0);
  }
  return { cost: cost / runs.length, meanTime: t / runs.length, meanOvershoot: o / runs.length, maxFinalError: fe, timeouts, runs };
}

/** Nelder–Mead on log-parameters (keeps every gain positive). */
function nelderMead(f: (x: number[]) => number, x0: number[], iters = 60, step = 0.35) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    x[i] += step;
    simplex.push(x);
  }
  let vals = simplex.map(f);
  for (let k = 0; k < iters; k++) {
    const order = vals.map((v, i) => [v, i]).sort((A, B) => A[0] - B[0]).map((p) => p[1]);
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
      if (fe < fr) {
        simplex[n] = exp;
        vals[n] = fe;
      } else {
        simplex[n] = refl;
        vals[n] = fr;
      }
    } else if (fr < vals[n - 1]) {
      simplex[n] = refl;
      vals[n] = fr;
    } else {
      const con = cen.map((c, j) => c + 0.5 * (worst[j] - c));
      const fc = f(con);
      if (fc < vals[n]) {
        simplex[n] = con;
        vals[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          vals[i] = f(simplex[i]);
        }
      }
    }
  }
  const best = vals.indexOf(Math.min(...vals));
  return { x: simplex[best], f: vals[best] };
}

export interface LqrTuneResult {
  model: YawModel;
  analytic: { K1: number; K2: number; zeta: number; wn: number };
  params: LqrTurnParams;
  before: TurnScore;
  after: TurnScore;
  /** values for the team's function signature turn_lqr(..., Q, R, b, kd, Minpower) */
  signature: { Q: number; R: number; b: number; kd: number; Minpower: number };
}

export function tuneLqr(p: RobotProfile, current: LqrTurnParams = LQR_DEFAULT, Q = 1, R = 0.01): LqrTuneResult {
  const model = yawModel(p);
  const analytic = solveYawLqr(model, brysonWeights(15, 600, current.Maxpower));
  const minP = Math.min(30, Math.max(6, Math.ceil(model.breakaway + 1.5)));
  const evalP = (K1: number, K2: number) => ({ ...current, K1, K2, Minpower: minP });
  const runSet = (prm: LqrTurnParams) => scoreTurns(TURN_SET.map((a) => simTurnLqr(p, a, prm)));
  const before = runSet(current);
  // Start from whichever is better: analytic LQR or the team's current gains.
  const startA = runSet(evalP(analytic.K1, analytic.K2)).cost;
  const startC = runSet(evalP(current.K1, current.K2)).cost;
  const x0 = startA < startC ? [Math.log(analytic.K1), Math.log(analytic.K2)] : [Math.log(current.K1), Math.log(current.K2)];
  const res = nelderMead((x) => {
    const K1 = Math.exp(x[0]);
    const K2 = Math.exp(x[1]);
    if (K1 > 40 || K2 > 2) return 99;
    return runSet(evalP(K1, K2)).cost;
  }, x0, 45);
  const params = evalP(Math.exp(res.x[0]), Math.exp(res.x[1]));
  const after = runSet(params);
  return {
    model,
    analytic,
    params,
    before,
    after,
    signature: { Q, R, b: Math.sqrt(Q / R) / params.K1, kd: params.K2, Minpower: params.Minpower },
  };
}

export interface PidTuneResult {
  params: PidTurnParams;
  before: TurnScore;
  after: TurnScore;
}

export function tunePid(p: RobotProfile, current: PidTurnParams = PID_DEFAULT): PidTuneResult {
  const model = yawModel(p);
  const minP = Math.min(30, Math.max(6, Math.ceil(model.breakaway + 1.5)));
  const runSet = (prm: PidTurnParams) => scoreTurns(TURN_SET.map((a) => simTurnPid(p, a, prm)));
  const before = runSet(current);
  const mk = (x: number[]) => ({ ...current, Kp: Math.exp(x[0]), Kd: Math.exp(x[1]), Ki: Math.exp(x[2]) - 0.01, Minpower: minP });
  const res = nelderMead((x) => {
    const prm = mk(x);
    if (prm.Kp > 40 || prm.Kd > 2 || prm.Ki > 20) return 99;
    return runSet(prm).cost;
  }, [Math.log(current.Kp), Math.log(Math.max(0.01, current.Kd)), Math.log(Math.max(0, current.Ki) + 0.01)], 50);
  const params = mk(res.x);
  params.Ki = Math.max(0, params.Ki);
  return { params, before, after: runSet(params) };
}

export interface DbTuneResult {
  params: Required<DbTurnParams>;
  before: TurnScore;
  after: TurnScore;
}

export function tuneDriveBase(p: RobotProfile, current: DbTurnParams = { turn_rate: 180 }): DbTuneResult {
  const d = derive(p);
  const defAcc = Math.round(d.wMaxDeg * 0.4 * 3);
  const runSet = (prm: DbTurnParams) => scoreTurns(TURN_SET.map((a) => simTurnGyro(p, a, prm)));
  const before = runSet(current);
  let best: Required<DbTurnParams> = { turn_rate: current.turn_rate, turn_acceleration: current.turn_acceleration ?? defAcc };
  let bestCost = runSet(best).cost;
  for (const rate of [150, 216, 300, 400, 500, 600]) {
    for (const acc of [600, 1000, 1500, 2200, 3000]) {
      if (rate > d.wMaxDeg * 0.85) continue;
      const c = runSet({ turn_rate: rate, turn_acceleration: acc }).cost;
      if (c < bestCost) {
        bestCost = c;
        best = { turn_rate: rate, turn_acceleration: acc };
      }
    }
  }
  return { params: best, before, after: runSet(best) };
}

export interface StraightTuneResult {
  params: StraightHoldParams;
  before: { lateral: number; heading: number };
  after: { lateral: number; heading: number };
}

function straightCost(p: RobotProfile, prm: StraightHoldParams) {
  let lat = 0;
  let head = 0;
  let wob = 0;
  for (const [deg, seed] of [[1200, 3], [600, 11]] as const) {
    const m = simStraightHold(p, deg, prm, seed);
    // wobble: how much the heading wiggles (high gains shake the robot)
    let wobble = 0;
    for (let i = 1; i < m.trace.h.length; i++) wobble += Math.abs(m.trace.h[i] - m.trace.h[i - 1]);
    lat = Math.max(lat, Math.abs(m.lateralMm));
    head = Math.max(head, Math.abs(m.headingError));
    wob = Math.max(wob, wobble);
  }
  return { lat, head, cost: lat + 4 * head + 0.5 * wob };
}

export function tuneStraight(p: RobotProfile, kind: "lqr" | "pid", current?: StraightHoldParams): StraightTuneResult {
  const base = current ?? (kind === "lqr" ? STRAIGHT_LQR_DEFAULT : STRAIGHT_PID_DEFAULT);
  const b0 = straightCost(p, base);
  const mk = (x: number[]): StraightHoldParams =>
    kind === "lqr" ? { ...base, K1: Math.exp(x[0]), K2: Math.exp(x[1]) } : { ...base, Kp: Math.exp(x[0]), Kd: Math.exp(x[1]) };
  const x0 = kind === "lqr" ? [Math.log(base.K1!), Math.log(base.K2!)] : [Math.log(base.Kp!), Math.log(Math.max(0.01, base.Kd!))];
  const res = nelderMead((x) => {
    const prm = mk(x);
    const g1 = kind === "lqr" ? prm.K1! : prm.Kp!;
    const g2 = kind === "lqr" ? prm.K2! : prm.Kd!;
    if (g1 > 8 || g2 > 0.25) return 999;
    return straightCost(p, prm).cost;
  }, x0, 30);
  const params = mk(res.x);
  const a = straightCost(p, params);
  return { params, before: { lateral: b0.lat, heading: b0.head }, after: { lateral: a.lat, heading: a.head } };
}

export interface FullTune {
  lqr: LqrTuneResult;
  pid: PidTuneResult;
  db: DbTuneResult;
  straightLqr: StraightTuneResult;
  straightPid: StraightTuneResult;
  ms: number;
}

export interface TuneInputs {
  lqr?: LqrTurnParams & { Q?: number; R?: number };
  pid?: PidTurnParams;
  db?: DbTurnParams;
  straight?: StraightHoldParams;
}

export function tuneAll(p: RobotProfile, cur: TuneInputs = {}): FullTune {
  const t0 = performance.now();
  const lqr = tuneLqr(p, cur.lqr ?? LQR_DEFAULT, cur.lqr?.Q ?? 1, cur.lqr?.R ?? 0.01);
  const pid = tunePid(p, cur.pid ?? PID_DEFAULT);
  const db = tuneDriveBase(p, cur.db ?? { turn_rate: 180 });
  const straightLqr = tuneStraight(p, "lqr", cur.straight);
  const straightPid = tuneStraight(p, "pid");
  return { lqr, pid, db, straightLqr, straightPid, ms: performance.now() - t0 };
}

const round = (x: number, d = 3) => {
  const k = Math.pow(10, d);
  return Math.round(x * k) / k;
};

/** Rewrite default values in a `def name(...)` signature, keeping everything else. */
export function applyDefaults(src: string, fn: string, values: Record<string, number>) {
  const re = new RegExp(`def\\s+${fn}\\s*\\(([\\s\\S]*?)\\)\\s*:`);
  const m = src.match(re);
  if (!m) return { src, changed: [] as string[] };
  let args = m[1];
  const changed: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    const ar = new RegExp(`(\\b${k}\\s*=\\s*)(-?[0-9.]+(?:[eE]-?[0-9]+)?)`);
    if (ar.test(args)) {
      args = args.replace(ar, `$1${round(v)}`);
      changed.push(k);
    }
  }
  const whole = m[0].replace(m[1], args);
  return { src: src.replace(m[0], whole), changed };
}
