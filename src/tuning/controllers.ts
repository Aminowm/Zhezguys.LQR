// Fast JavaScript twins of the Python functions in the starter code
// (turn_lqr, turn_pid, turn_gyro, straight_lqr, straight_pid, straight_gyro).
// They make the same hub calls in the same order, so they behave like the
// Python versions in the simulator but run ~100x faster. The auto-tuner
// uses them to try hundreds of gain combinations in a fraction of a second.

import { Sim } from "../sim/physics";
import { RobotProfile } from "../sim/robot";

export interface LqrTurnParams {
  K1: number;
  K2: number;
  Maxpower: number;
  Minpower: number;
  Tolerance: number;
  Settle: number;
  Timeout: number;
}
export interface PidTurnParams {
  Kp: number;
  Ki: number;
  Kd: number;
  Maxpower: number;
  Minpower: number;
  Tolerance: number;
  Settle: number;
  Timeout: number;
}
export interface DbTurnParams {
  turn_rate: number;
  turn_acceleration?: number;
}

export const LQR_DEFAULT: LqrTurnParams = {
  K1: Math.sqrt(1 / 0.01) / 2,
  K2: 0.08,
  Maxpower: 80,
  Minpower: 12,
  Tolerance: 1.0,
  Settle: 150,
  Timeout: 3000,
};
export const PID_DEFAULT: PidTurnParams = {
  Kp: 3.0,
  Ki: 0,
  Kd: 0.15,
  Maxpower: 80,
  Minpower: 12,
  Tolerance: 1.0,
  Settle: 150,
  Timeout: 3000,
};
export const DB_DEFAULT: DbTurnParams = { turn_rate: 180 };

class Hub {
  sim: Sim;
  constructor(profile: RobotProfile, seed = 7) {
    this.sim = new Sim({ profile, start: { x: 1181, y: 571, headingDeg: 0 }, seed, maxTimeMs: 60000, walls: false });
    const s = this.sim;
    s.motor("B", "counterclockwise");
    s.motor("F", "clockwise");
    s.motor("E", "clockwise");
    s.motor("A", "clockwise");
    s.driveBase("B", "F", profile.wheelDiameterMm, profile.axleTrackMm);
    s.dbUseGyro(true);
    s.db!.settings.turn_rate = 216;
    s.gyroReset(0);
  }
  stopwatch() {
    const t0 = this.sim.now();
    return () => {
      this.sim.callCost();
      return Math.trunc(this.sim.now() - t0);
    };
  }
  gyro() {
    this.sim.callCost();
    return this.sim.gyroHeading();
  }
  dc(port: "B" | "F", u: number) {
    this.sim.callCost();
    this.sim.motorDc(port, u);
  }
  wait(ms: number) {
    this.sim.callCost();
    this.sim.advance(ms);
  }
  angle(port: "B" | "F") {
    this.sim.callCost();
    return Math.round(this.sim.getMotor(port).userAngle());
  }
  resetAngle(port: "B" | "F") {
    this.sim.callCost();
    this.sim.motorResetAngle(port, 0);
  }
}

export interface TurnTrace {
  t: number[];
  h: number[];
  u: number[];
}

export interface TurnMetrics {
  target: number;
  returnMs: number; // when the function returned
  settleMs: number; // last time |error| > 1°
  overshoot: number; // degrees past the target (≥ 0)
  finalError: number; // after 0.5 s coasting
  peakPower: number;
  timedOut: boolean;
  trace: TurnTrace;
}

function finish(h: Hub, target: number, returnMs: number, timedOut: boolean): TurnMetrics {
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
  // keep a light trace for charts (every 20 ms)
  const trace: TurnTrace = { t: [], h: [], u: [] };
  for (let i = 0; i < f.t.length; i += 2) {
    trace.t.push(f.t[i]);
    trace.h.push(f.h[i]);
    trace.u.push(f.dl[i]);
  }
  return {
    target,
    returnMs,
    settleMs: settle,
    overshoot: Math.max(0, over),
    finalError: f.h[f.h.length - 1] - target,
    peakPower: peak,
    timedOut,
    trace,
  };
}

export function simTurnLqr(profile: RobotProfile, target: number, p: LqrTurnParams, seed = 7): TurnMetrics {
  const h = new Hub(profile, seed);
  const s = h.sim;
  const t0 = s.now();
  const timer = h.stopwatch();
  const total = h.stopwatch();
  let lastTime = timer();
  let lastError = target - h.gyro();
  let rate = 0;
  let settled = 0;
  let timedOut = true;
  while (total() < p.Timeout) {
    const now = timer();
    const dt = (now - lastTime) / 1000;
    const error = target - h.gyro();
    if (dt > 0) rate = 0.7 * rate + 0.3 * ((error - lastError) / dt);
    let u = p.K1 * error + p.K2 * rate;
    u = Math.max(-p.Maxpower, Math.min(p.Maxpower, u));
    if (Math.abs(error) > p.Tolerance && Math.abs(u) < p.Minpower) u = u >= 0 ? p.Minpower : -p.Minpower;
    if (Math.abs(error) <= p.Tolerance && Math.abs(rate) < 15) {
      settled += now - lastTime;
      u = 0;
      if (settled >= p.Settle) {
        timedOut = false;
        break;
      }
    } else settled = 0;
    h.dc("B", u);
    h.dc("F", -u);
    lastError = error;
    lastTime = now;
    h.wait(10);
  }
  const ret = s.now() - t0;
  s.callCost();
  s.dbStop("coast");
  return finish(h, target, ret, timedOut);
}

export function simTurnPid(profile: RobotProfile, target: number, p: PidTurnParams, seed = 7): TurnMetrics {
  const h = new Hub(profile, seed);
  const s = h.sim;
  const t0 = s.now();
  const timer = h.stopwatch();
  let lastTime = timer();
  let lastError = target - h.gyro();
  let integral = 0;
  let settled = 0;
  let timedOut = true;
  while (timer() < p.Timeout) {
    const now = timer();
    const dt = (now - lastTime) / 1000;
    const error = target - h.gyro();
    let deriv = 0;
    if (dt > 0) {
      integral = Math.max(-30, Math.min(30, integral + error * dt));
      deriv = (error - lastError) / dt;
    }
    let u = p.Kp * error + p.Ki * integral + p.Kd * deriv;
    u = Math.max(-p.Maxpower, Math.min(p.Maxpower, u));
    if (Math.abs(error) > p.Tolerance && Math.abs(u) < p.Minpower) u = u >= 0 ? p.Minpower : -p.Minpower;
    if (Math.abs(error) <= p.Tolerance && Math.abs(deriv) < 15) {
      settled += now - lastTime;
      u = 0;
      if (settled >= p.Settle) {
        timedOut = false;
        break;
      }
    } else settled = 0;
    h.dc("B", u);
    h.dc("F", -u);
    lastError = error;
    lastTime = now;
    h.wait(10);
  }
  const ret = s.now() - t0;
  s.callCost();
  s.dbStop("coast");
  return finish(h, target, ret, timedOut);
}

export function simTurnGyro(profile: RobotProfile, target: number, p: DbTurnParams, seed = 7): TurnMetrics {
  const h = new Hub(profile, seed);
  const s = h.sim;
  const t0 = s.now();
  s.callCost();
  s.db!.settings.turn_rate = p.turn_rate;
  if (p.turn_acceleration) s.db!.settings.turn_acceleration = p.turn_acceleration;
  s.callCost();
  s.dbTurn(target, "hold");
  const ok = s.advanceUntil(() => s.dbDone(), 20000);
  const ret = s.now() - t0;
  s.callCost();
  s.dbStop("coast");
  return finish(h, target, ret, !ok);
}

export interface StraightMetrics {
  distanceMm: number; // travelled along the start heading
  lateralMm: number; // sideways drift
  headingError: number;
  returnMs: number;
  trace: { t: number[]; h: number[]; lat: number[] };
}

export interface StraightHoldParams {
  kind: "lqr" | "pid";
  K1?: number;
  K2?: number;
  Kp?: number;
  Ki?: number;
  Kd?: number;
  Power: number;
  Minpower: number;
  Accel: number;
  Decel: number;
}

export const STRAIGHT_LQR_DEFAULT: StraightHoldParams = {
  kind: "lqr",
  K1: Math.sqrt(1 / 0.01) / 4,
  K2: 0.04,
  Power: 60,
  Minpower: 20,
  Accel: 150,
  Decel: 250,
};
export const STRAIGHT_PID_DEFAULT: StraightHoldParams = {
  kind: "pid",
  Kp: 2.0,
  Ki: 0,
  Kd: 0.05,
  Power: 60,
  Minpower: 20,
  Accel: 150,
  Decel: 250,
};

function finishStraight(h: Hub, returnMs: number): StraightMetrics {
  const s = h.sim;
  s.advance(500);
  const f = s.frames;
  const x0 = f.x[0];
  const y0 = f.y[0];
  const trace = { t: [] as number[], h: [] as number[], lat: [] as number[] };
  for (let i = 0; i < f.t.length; i += 2) {
    trace.t.push(f.t[i]);
    trace.h.push(f.h[i]);
    trace.lat.push(f.y[i] - y0);
  }
  const n = f.t.length - 1;
  return {
    distanceMm: f.x[n] - x0,
    lateralMm: f.y[n] - y0,
    headingError: f.h[n],
    returnMs,
    trace,
  };
}

export function simStraightHold(profile: RobotProfile, deg: number, p: StraightHoldParams, seed = 7): StraightMetrics {
  const h = new Hub(profile, seed);
  const s = h.sim;
  const t0 = s.now();
  const target = h.gyro() * 0; // heading 0
  const dir = p.Power >= 0 ? 1 : -1;
  const power = Math.abs(p.Power);
  h.resetAngle("B");
  h.resetAngle("F");
  const timer = h.stopwatch();
  let lastTime = timer();
  let lastError = target - h.gyro();
  let rate = 0;
  let integral = 0;
  while (timer() < 8000) {
    const now = timer();
    const dt = (now - lastTime) / 1000;
    const traveled = (Math.abs(h.angle("B")) + Math.abs(h.angle("F"))) / 2;
    if (traveled >= deg) break;
    const up = p.Minpower + (power - p.Minpower) * Math.min(1, traveled / p.Accel);
    const down = p.Minpower + (power - p.Minpower) * Math.min(1, (deg - traveled) / p.Decel);
    const base = Math.min(power, up, down) * dir;
    const error = target - h.gyro();
    let u: number;
    if (p.kind === "lqr") {
      if (dt > 0) rate = 0.7 * rate + 0.3 * ((error - lastError) / dt);
      u = p.K1! * error + p.K2! * rate;
    } else {
      let deriv = 0;
      if (dt > 0) {
        integral = Math.max(-20, Math.min(20, integral + error * dt));
        deriv = (error - lastError) / dt;
      }
      u = p.Kp! * error + p.Ki! * integral + p.Kd! * deriv;
    }
    u = Math.max(-40, Math.min(40, u));
    h.dc("B", base + u);
    h.dc("F", base - u);
    lastError = error;
    lastTime = now;
    h.wait(10);
  }
  h.dc("B", 0);
  h.dc("F", 0);
  s.callCost();
  s.motorStop("B", "brake");
  s.callCost();
  s.motorStop("F", "brake");
  return finishStraight(h, s.now() - t0);
}

export function simStraightGyro(profile: RobotProfile, mm: number, seed = 7, settings?: { straight_speed?: number; straight_acceleration?: number }): StraightMetrics {
  const h = new Hub(profile, seed);
  const s = h.sim;
  const t0 = s.now();
  if (settings?.straight_speed) s.db!.settings.straight_speed = settings.straight_speed;
  if (settings?.straight_acceleration) s.db!.settings.straight_acceleration = settings.straight_acceleration;
  s.callCost();
  s.dbStraight(mm, "hold");
  s.advanceUntil(() => s.dbDone(), 20000);
  const ret = s.now() - t0;
  s.callCost();
  s.dbStop("coast");
  return finishStraight(h, ret);
}

/** Open loop: move_deg with equal power on both motors (no gyro). */
export function simMoveDeg(profile: RobotProfile, deg: number, power: number, seed = 7): StraightMetrics {
  const h = new Hub(profile, seed);
  const s = h.sim;
  const t0 = s.now();
  h.resetAngle("B");
  h.resetAngle("F");
  while ((Math.abs(h.angle("B")) + Math.abs(h.angle("F"))) / 2 < deg) {
    h.dc("B", power);
    h.dc("F", power);
    h.wait(10);
  }
  h.dc("B", 0);
  h.dc("F", 0);
  s.motorStop("B", "brake");
  s.motorStop("F", "brake");
  return finishStraight(h, s.now() - t0);
}
