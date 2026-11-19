// Fast JavaScript twins of the starter-code functions (lqr_turn, pid_turn,
// gyro_turn, lqr_straight, pid_straight, gyro_straight). They make the same
// hub calls in the same order as the Python, so they behave like the real
// code in the simulator but run ~100× faster — the tuner and the landing demo
// use them; the Compare page runs the real Python.

import { Sim } from "../sim/physics";
import { breakawayDrivePower, breakawayTurnPower, derive, RobotProfile } from "../sim/robot";

// ───── robot model constants (what the site writes into config.py) ─────
export interface ModelConstants {
  WHEEL_D: number;
  AXLE: number;
  YAW_A: number;
  YAW_B: number;
  LIN_A: number;
  LIN_B: number;
  U_TURN0: number;
  U_DRIVE0: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function modelConstants(p: RobotProfile): ModelConstants {
  const d = derive(p);
  return {
    // average rolling diameter of the two tyres (the right one is wheelMismatchPct smaller)
    WHEEL_D: r2(p.wheelDiameterMm * (1 - (p.wheelMismatchPct ?? 0) / 200)),
    AXLE: r2(p.axleTrackMm),
    YAW_A: r2(d.yawA),
    YAW_B: r2(d.yawB),
    LIN_A: r2(d.linA),
    LIN_B: r2(d.linB),
    U_TURN0: r2(breakawayTurnPower(p)),
    U_DRIVE0: r2(breakawayDrivePower(p)),
  };
}

export function lqrGains(a: number, b: number, eMax: number, rateMax: number, uMax: number): [number, number] {
  const q1 = 1 / (eMax * eMax);
  const q2 = 1 / (rateMax * rateMax);
  const r = 1 / (uMax * uMax);
  const k1 = Math.sqrt(q1 / r);
  const p2 = Math.sqrt(q1 * r) / b;
  const k2 = (a + Math.sqrt(a * a + ((b * b) / r) * (2 * p2 + q2))) / b;
  return [k1, k2];
}

export interface LqrSettings {
  TURN_SPEED: number;
  TURN_ACC: number;
  TURN_E_MAX: number;
  TURN_RATE_MAX: number;
  TURN_TOL: number;
  TURN_SETTLE: number;
  DRIVE_E_MAX: number;
  DRIVE_V_MAX: number;
  HOLD_E_MAX: number;
  HOLD_RATE_MAX: number;
}
export const LQR_DEFAULT: LqrSettings = {
  TURN_SPEED: 0.55,
  TURN_ACC: 0.35,
  TURN_E_MAX: 6,
  TURN_RATE_MAX: 300,
  TURN_TOL: 0.2,
  TURN_SETTLE: 100,
  DRIVE_E_MAX: 8,
  DRIVE_V_MAX: 200,
  HOLD_E_MAX: 2,
  HOLD_RATE_MAX: 120,
};

export interface PidSettings {
  PID_KP: number;
  PID_KI: number;
  PID_KD: number;
  PID_MINPOWER: number;
  PID_TOL: number;
  PID_SETTLE: number;
  HOLD_KP: number;
  HOLD_KI: number;
  HOLD_KD: number;
  DRIVE_MINPOWER: number;
}
export const PID_DEFAULT: PidSettings = {
  PID_KP: 3.0,
  PID_KI: 0,
  PID_KD: 0.15,
  PID_MINPOWER: 12,
  PID_TOL: 1.0,
  PID_SETTLE: 150,
  HOLD_KP: 2.0,
  HOLD_KI: 0,
  HOLD_KD: 0.05,
  DRIVE_MINPOWER: 20,
};

export interface GyroSettings {
  GYRO_TURN_RATE: number;
  GYRO_TURN_ACC: number;
}
export const GYRO_DEFAULT: GyroSettings = { GYRO_TURN_RATE: 180, GYRO_TURN_ACC: 720 };

export const PRESETS = {
  FAST: { vmax: 85, acc: 500, kd: 1.0 },
  NORMAL: { vmax: 65, acc: 400, kd: 0.8 },
  SLOW: { vmax: 45, acc: 300, kd: 0.7 },
  CRAWL: { vmax: 30, acc: 250, kd: 0.6 },
};
export type Preset = (typeof PRESETS)["NORMAL"];

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

class Hub {
  sim: Sim;
  m: ModelConstants;
  constructor(profile: RobotProfile, seed = 7) {
    this.m = modelConstants(profile);
    this.sim = new Sim({ profile, start: { x: 1181, y: 571, headingDeg: 0 }, seed, maxTimeMs: 60000, walls: false });
    const s = this.sim;
    s.motor("B", "counterclockwise");
    s.motor("F", "clockwise");
    s.motor("A", "clockwise");
    s.motor("E", "clockwise");
    s.driveBase("B", "F", this.m.WHEEL_D, this.m.AXLE);
    s.dbUseGyro(true);
    s.gyroReset(0);
  }
  c() {
    this.sim.callCost();
  }
  stopwatch() {
    const t0 = this.sim.now();
    return () => {
      this.c();
      return Math.trunc(this.sim.now() - t0);
    };
  }
  heading() {
    this.c();
    return this.sim.gyroHeading();
  }
  rate() {
    this.c();
    return -this.sim.gyroRateZ();
  }
  dc(port: "B" | "F", u: number) {
    this.c();
    this.sim.motorDc(port, u);
  }
  hold(port: "B" | "F") {
    this.c();
    this.sim.motorHold(port);
  }
  brake(port: "B" | "F") {
    this.c();
    this.sim.motorStop(port, "brake");
  }
  angle(port: "B" | "F") {
    this.c();
    return Math.round(this.sim.getMotor(port).userAngle());
  }
  speed(port: "B" | "F") {
    this.c();
    return Math.round(this.sim.getMotor(port).userSpeed());
  }
  resetAngle(port: "B" | "F") {
    this.c();
    this.sim.motorResetAngle(port, 0);
  }
  wait(ms: number) {
    this.c();
    this.sim.advance(ms);
  }
  mmPerDeg() {
    return (Math.PI * this.m.WHEEL_D) / 360;
  }
  topSpeed() {
    return (-this.m.LIN_B * 100) / this.m.LIN_A;
  }
}

export interface TurnTrace {
  t: number[];
  h: number[];
  u: number[];
}

export interface TurnMetrics {
  target: number;
  returnMs: number;
  settleMs: number;
  overshoot: number;
  finalError: number;
  peakPower: number;
  timedOut: boolean;
  trace: TurnTrace;
}

function finishTurn(h: Hub, target: number, returnMs: number, timedOut: boolean): TurnMetrics {
  const s = h.sim;
  s.advance(500);
  const f = s.frames;
  const sign = Math.sign(target) || 1;
  let over = 0;
  let settle = 0;
  let peak = 0;
  for (let i = 0; i < f.t.length; i++) {
    const e = f.h[i] - target;
    over = Math.max(over, e * sign);
    if (Math.abs(e) > 1) settle = f.t[i];
    peak = Math.max(peak, Math.abs(f.dl[i]), Math.abs(f.dr[i]));
  }
  const trace: TurnTrace = { t: [], h: [], u: [] };
  for (let i = 0; i < f.t.length; i += 2) {
    trace.t.push(f.t[i]);
    trace.h.push(f.h[i]);
    trace.u.push(f.dl[i]);
  }
  return { target, returnMs, settleMs: settle, overshoot: Math.max(0, over), finalError: f.h[f.h.length - 1] - target, peakPower: peak, timedOut, trace };
}

/** Twin of lqr_turn(target, ulim) for a spin turn from heading 0. */
export function simLqrTurn(profile: RobotProfile, target: number, ulim = 100, L: LqrSettings = LQR_DEFAULT, seed = 7): TurnMetrics {
  const h = new Hub(profile, seed);
  const m = h.m;
  const t0 = h.sim.now();
  const b = m.YAW_B;
  const u0 = m.U_TURN0;
  const [k1, k2] = lqrGains(m.YAW_A, b, L.TURN_E_MAX, L.TURN_RATE_MAX, ulim);
  const ki = 2 * k1;
  const h0 = h.heading();
  const s = target >= h0 ? 1 : -1;
  const D = Math.abs(target - h0);
  let top = L.TURN_SPEED * ((-b * ulim) / m.YAW_A);
  const acc = L.TURN_ACC * b * ulim;
  let tAcc = top / acc;
  let dAcc = 0.5 * acc * tAcc * tAcc;
  if (2 * dAcc > D) {
    tAcc = Math.sqrt(D / acc);
    top = acc * tAcc;
    dAcc = D / 2;
  }
  const tEnd = 2 * tAcc + (top > 0 ? (D - 2 * dAcc) / top : 0);
  let integ = 0;
  let settled = 0;
  const sw = h.stopwatch();
  let last = sw();
  let timedOut = true;
  while (sw() < 4000) {
    const now = sw();
    const dt = (now - last) / 1000;
    last = now;
    const t = now / 1000;
    let p: number, wRef: number, aRef: number;
    if (t < tAcc) [p, wRef, aRef] = [0.5 * acc * t * t, acc * t, acc];
    else if (t < tEnd - tAcc) [p, wRef, aRef] = [dAcc + top * (t - tAcc), top, 0];
    else if (t < tEnd) {
      const td = tEnd - t;
      [p, wRef, aRef] = [D - 0.5 * acc * td * td, acc * td, -acc];
    } else [p, wRef, aRef] = [D, 0, 0];
    const e = h0 + s * p - h.heading();
    const w = h.rate();
    let u: number;
    if (t < tEnd) {
      const uff = (aRef - m.YAW_A * wRef) / b + (wRef > 0 ? u0 : 0);
      u = s * uff + k1 * e + k2 * (s * wRef - w);
    } else {
      integ = Math.abs(e) < 2 ? clamp(integ + e * dt, -2, 2) : 0;
      u = k1 * e - k2 * w + ki * integ + (u0 * e) / (Math.abs(e) + 0.3);
      if (Math.abs(e) <= L.TURN_TOL && Math.abs(w) < 4) {
        settled += dt * 1000;
        u = 0;
        if (settled >= L.TURN_SETTLE) {
          timedOut = false;
          break;
        }
      } else settled = 0;
    }
    u = clamp(u, -ulim, ulim);
    h.dc("B", u);
    h.dc("F", -u);
    h.wait(5);
  }
  h.hold("B");
  h.hold("F");
  return finishTurn(h, target, h.sim.now() - t0, timedOut);
}

/** Twin of pid_turn(target, ulim). */
export function simPidTurn(profile: RobotProfile, target: number, ulim = 100, P: PidSettings = PID_DEFAULT, seed = 7): TurnMetrics {
  const h = new Hub(profile, seed);
  const t0 = h.sim.now();
  const sw = h.stopwatch();
  let last = sw();
  let lastE = target - h.heading();
  let integ = 0;
  let settled = 0;
  let timedOut = true;
  while (sw() < 3000) {
    const now = sw();
    const dt = (now - last) / 1000;
    const e = target - h.heading();
    let d = 0;
    if (dt > 0) {
      integ = clamp(integ + e * dt, -30, 30);
      d = (e - lastE) / dt;
    }
    let u = clamp(P.PID_KP * e + P.PID_KI * integ + P.PID_KD * d, -ulim, ulim);
    if (Math.abs(e) > P.PID_TOL && Math.abs(u) < P.PID_MINPOWER) u = u >= 0 ? P.PID_MINPOWER : -P.PID_MINPOWER;
    if (Math.abs(e) <= P.PID_TOL && Math.abs(d) < 15) {
      settled += now - last;
      u = 0;
      if (settled >= P.PID_SETTLE) {
        timedOut = false;
        break;
      }
    } else settled = 0;
    h.dc("B", u);
    h.dc("F", -u);
    lastE = e;
    last = now;
    h.wait(10);
  }
  h.brake("B");
  h.brake("F");
  return finishTurn(h, target, h.sim.now() - t0, timedOut);
}

/** Twin of gyro_turn(target, ulim): Pybricks DriveBase.turn + stop. */
export function simGyroTurn(profile: RobotProfile, target: number, ulim = 100, G: GyroSettings = GYRO_DEFAULT, seed = 7): TurnMetrics {
  const h = new Hub(profile, seed);
  const s = h.sim;
  const t0 = s.now();
  h.c();
  s.db!.settings.turn_rate = (G.GYRO_TURN_RATE * ulim) / 100;
  s.db!.settings.turn_acceleration = G.GYRO_TURN_ACC;
  const delta = target - h.heading();
  h.c();
  s.dbTurn(delta, "hold");
  const ok = s.advanceUntil(() => s.dbDone(), 20000);
  h.c();
  s.dbStop("coast");
  return finishTurn(h, target, s.now() - t0, !ok);
}

export interface StraightMetrics {
  distErr: number; // mm, + = too far
  lateralMm: number;
  headingError: number;
  returnMs: number;
  trace: { t: number[]; h: number[]; lat: number[] };
}

function finishStraight(h: Hub, mm: number, returnMs: number): StraightMetrics {
  const s = h.sim;
  s.advance(500);
  const f = s.frames;
  const trace = { t: [] as number[], h: [] as number[], lat: [] as number[] };
  for (let i = 0; i < f.t.length; i += 2) {
    trace.t.push(f.t[i]);
    trace.h.push(f.h[i]);
    trace.lat.push(f.y[i] - f.y[0]);
  }
  const n = f.t.length - 1;
  return { distErr: f.x[n] - f.x[0] - mm, lateralMm: f.y[n] - f.y[0], headingError: f.h[n] - f.h[0], returnMs, trace };
}

/** Twin of lqr_straight(dist, vmax, acc, kd) with TARGET = 0. */
export function simLqrStraight(profile: RobotProfile, dist: number, pr: Preset = PRESETS.NORMAL, L: LqrSettings = LQR_DEFAULT, seed = 7): StraightMetrics {
  const h = new Hub(profile, seed);
  const m = h.m;
  const t0 = h.sim.now();
  const s = dist >= 0 ? 1 : -1;
  const D = Math.abs(dist);
  let top = (pr.vmax / 100) * h.topSpeed();
  const acc = pr.acc;
  const [ks1, ks2] = lqrGains(m.LIN_A, m.LIN_B, L.DRIVE_E_MAX, L.DRIVE_V_MAX, 60);
  const [kh1, kh2] = lqrGains(m.YAW_A, m.YAW_B, L.HOLD_E_MAX, L.HOLD_RATE_MAX, 40);
  let tAcc = top / acc;
  let dAcc = 0.5 * acc * tAcc * tAcc;
  if (2 * dAcc > D) {
    tAcc = Math.sqrt(D / acc);
    top = acc * tAcc;
    dAcc = D / 2;
  }
  const tEnd = 2 * tAcc + (D - 2 * dAcc) / top;
  const k = h.mmPerDeg();
  h.resetAngle("B");
  h.resetAngle("F");
  const sw = h.stopwatch();
  while (sw() < 10000) {
    const t = sw() / 1000;
    let p: number, vRef: number, aRef: number;
    if (t < tAcc) [p, vRef, aRef] = [0.5 * acc * t * t, acc * t, acc];
    else if (t < tEnd - tAcc) [p, vRef, aRef] = [dAcc + top * (t - tAcc), top, 0];
    else if (t < tEnd) {
      const td = tEnd - t;
      [p, vRef, aRef] = [D - 0.5 * acc * td * td, acc * td, -acc];
    } else [p, vRef, aRef] = [D, 0, 0];
    const pos = (s * (h.angle("B") + h.angle("F"))) / 2 * k;
    const vel = (s * (h.speed("B") + h.speed("F"))) / 2 * k;
    const uff = (aRef - m.LIN_A * vRef) / m.LIN_B + (vRef > 0 ? m.U_DRIVE0 : 0);
    const u = s * clamp(uff + ks1 * (p - pos) + ks2 * (vRef - vel), -100, 100);
    const e = 0 - h.heading();
    const uh = clamp(kh1 * e - pr.kd * kh2 * h.rate(), -40, 40);
    h.dc("B", clamp(u + uh, -100, 100));
    h.dc("F", clamp(u - uh, -100, 100));
    if (t >= tEnd && Math.abs(p - pos) < 1 && Math.abs(vel) < 15) break;
    if (t > tEnd + 1.5) break;
    h.wait(5);
  }
  h.hold("B");
  h.hold("F");
  return finishStraight(h, dist, h.sim.now() - t0);
}

/** Twin of pid_straight(dist, vmax, acc, kd) with TARGET = 0. */
export function simPidStraight(profile: RobotProfile, dist: number, pr: Preset = PRESETS.NORMAL, P: PidSettings = PID_DEFAULT, seed = 7): StraightMetrics {
  const h = new Hub(profile, seed);
  const t0 = h.sim.now();
  const deg = Math.abs(dist) / h.mmPerDeg();
  const s = dist >= 0 ? 1 : -1;
  const ramp = Math.max(60, ((pr.vmax / 100) * h.topSpeed()) ** 2 / (2 * pr.acc) / h.mmPerDeg());
  h.resetAngle("B");
  h.resetAngle("F");
  const sw = h.stopwatch();
  let last = sw();
  let lastE = 0 - h.heading();
  let integ = 0;
  while (sw() < 10000) {
    const now = sw();
    const dt = (now - last) / 1000;
    const traveled = (Math.abs(h.angle("B")) + Math.abs(h.angle("F"))) / 2;
    if (traveled >= deg) break;
    const up = P.DRIVE_MINPOWER + (pr.vmax - P.DRIVE_MINPOWER) * Math.min(1, traveled / ramp);
    const down = P.DRIVE_MINPOWER + (pr.vmax - P.DRIVE_MINPOWER) * Math.min(1, (deg - traveled) / ramp);
    const base = Math.min(pr.vmax, up, down) * s;
    const e = 0 - h.heading();
    let d = 0;
    if (dt > 0) {
      integ = clamp(integ + e * dt, -20, 20);
      d = (e - lastE) / dt;
    }
    const u = clamp(P.HOLD_KP * e + P.HOLD_KI * integ + P.HOLD_KD * pr.kd * d, -40, 40);
    h.dc("B", base + u);
    h.dc("F", base - u);
    lastE = e;
    last = now;
    h.wait(10);
  }
  h.brake("B");
  h.brake("F");
  return finishStraight(h, dist, h.sim.now() - t0);
}

/** Twin of gyro_straight(dist, vmax, acc): Pybricks DriveBase.straight + stop. */
export function simGyroStraight(profile: RobotProfile, dist: number, pr: Preset = PRESETS.NORMAL, seed = 7): StraightMetrics {
  const h = new Hub(profile, seed);
  const s = h.sim;
  const t0 = s.now();
  h.c();
  s.db!.settings.straight_speed = (pr.vmax / 100) * h.topSpeed();
  s.db!.settings.straight_acceleration = pr.acc;
  h.c();
  s.dbStraight(dist, "hold");
  s.advanceUntil(() => s.dbDone(), 20000);
  h.c();
  s.dbStop("coast");
  return finishStraight(h, dist, s.now() - t0);
}
