// SPIKE Prime robot simulator.
//
// - Differential drive with real motor torque/speed curves (back-EMF),
//   battery voltage, motor mismatch, rolling resistance, tyre scrub and
//   stick-slip friction. That friction is why `Minpower` exists in real code.
// - Hub gyro with slow noise and drift.
// - Pybricks-like closed-loop motor control and DriveBase (trapezoid
//   profiles + PID, optional gyro).
// - Time only moves when the program calls the hub (wait(), motor calls …),
//   exactly like a real MicroPython program, so a run is deterministic and
//   can be replayed frame by frame.

import { derive, DerivedRobot, MOTOR_SPECS, PortName, RobotProfile } from "./robot";

export const TABLE_W = 2362;
export const TABLE_H = 1143;

export interface Pose {
  x: number; // mm from the left edge of the table
  y: number; // mm from the top (far) edge of the table, as seen on screen
  headingDeg: number; // clockwise from "pointing right" on screen
}

export type StopMode = "coast" | "brake" | "hold" | "none";

export interface SimEvent {
  t: number;
  kind: "print" | "wall" | "info" | "error" | "beep" | "display";
  text: string;
}

export interface SimFrames {
  t: number[];
  x: number[];
  y: number[];
  h: number[]; // true heading, deg clockwise
  gyro: number[]; // what hub.imu.heading() would return
  dl: number[]; // left motor power (physical, %)
  dr: number[];
  vl: number[]; // wheel speed mm/s
  vr: number[];
  att: Record<string, number[]>; // attachment motor angles (deg)
}

export interface SimResult {
  frames: SimFrames;
  events: SimEvent[];
  endTime: number;
  finalPose: Pose;
  error?: string;
}

const PHYS_DT = 0.0005; // s
const CONTROL_EVERY = 10; // physics steps → 5 ms control loop
const FRAME_MS = 10;
export const CALL_COST_MS = 0.08;

class MatchTimeOver extends Error {
  constructor() {
    super("MATCH_TIME_OVER");
  }
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Trapezoid (or triangle) motion profile. */
export class Trapezoid {
  readonly t0: number;
  readonly x0: number;
  readonly dist: number;
  private s: number;
  private v: number;
  private a: number;
  private tAcc: number;
  private tCruise: number;
  readonly duration: number;
  constructor(t0: number, x0: number, dist: number, vmax: number, acc: number) {
    this.t0 = t0;
    this.x0 = x0;
    this.dist = dist;
    this.s = Math.sign(dist) || 1;
    const D = Math.abs(dist);
    let v = Math.max(1e-6, Math.abs(vmax));
    const a = Math.max(1e-6, Math.abs(acc));
    let tAcc = v / a;
    let dAcc = 0.5 * a * tAcc * tAcc;
    if (2 * dAcc > D) {
      tAcc = Math.sqrt(D / a);
      v = a * tAcc;
      dAcc = D / 2;
    }
    const tCruise = (D - 2 * dAcc) / v;
    this.v = v;
    this.a = a;
    this.tAcc = tAcc;
    this.tCruise = tCruise;
    this.duration = 2 * tAcc + tCruise;
  }
  get end() {
    return this.t0 + this.duration;
  }
  pos(t: number) {
    const tt = Math.max(0, t - this.t0);
    const { a, v, tAcc, tCruise } = this;
    let d: number;
    if (tt <= tAcc) d = 0.5 * a * tt * tt;
    else if (tt <= tAcc + tCruise) d = 0.5 * a * tAcc * tAcc + v * (tt - tAcc);
    else if (tt <= this.duration) {
      const td = this.duration - tt;
      d = Math.abs(this.dist) - 0.5 * a * td * td;
    } else d = Math.abs(this.dist);
    return this.x0 + this.s * d;
  }
  vel(t: number) {
    const tt = t - this.t0;
    if (tt < 0 || tt > this.duration) return 0;
    const { a, v, tAcc, tCruise } = this;
    let vv: number;
    if (tt <= tAcc) vv = a * tt;
    else if (tt <= tAcc + tCruise) vv = v;
    else vv = a * (this.duration - tt);
    return this.s * vv;
  }
}

type MotorMode = "coast" | "brake" | "duty" | "servo" | "drivebase";

interface ServoState {
  kind: "angle" | "speed" | "hold";
  traj?: Trapezoid; // in user degrees, time in seconds
  speed?: number; // for run()
  speedRamp?: number; // current ramped speed
  refAngle: number;
  until?: number; // for run_time (s)
  then: StopMode;
  integ: number;
  done: boolean;
  stallT: number;
  stalled: boolean;
}

class SimMotor {
  port: PortName;
  side: "left" | "right" | null;
  userSign = 1; // user frame = userSign * physical frame
  mode: MotorMode = "coast";
  duty = 0; // user frame %
  appliedPhys = 0; // physical duty actually applied (for logging)
  // physical rotation (rad) & speed (rad/s). For drive motors derived from the body.
  ang = 0;
  w = 0;
  offset = 0; // user deg offset from reset_angle
  servo: ServoState | null = null;
  // attachment-only physics
  loadInertia = 2.5e-4;
  constructor(port: PortName, side: "left" | "right" | null) {
    this.port = port;
    this.side = side;
  }
  userAngle() {
    return this.userSign * (this.ang * 180) / Math.PI - this.offset;
  }
  userSpeed() {
    return (this.userSign * this.w * 180) / Math.PI;
  }
}

interface DbSettings {
  straight_speed: number;
  straight_acceleration: number;
  turn_rate: number;
  turn_acceleration: number;
}

/** DriveBase controller gains, in motor-degree units like Pybricks' servos. */
export const DB_GAINS = { kpS: 2.5, kdS: 0.15, kiS: 2, kpH: 12, kdH: 0.5, kiH: 3 };

interface DbManeuver {
  kind: "straight" | "turn" | "curve" | "drive" | "hold";
  s?: Trapezoid; // distance mm, seconds
  h?: Trapezoid; // heading deg, seconds
  curveRadius?: number;
  curveH0?: number;
  curveS0?: number;
  driveSpeed?: number;
  driveRate?: number;
  curSpeed?: number;
  curRate?: number;
  sRef: number;
  hRef: number;
  then: StopMode;
  end: number;
  done: boolean;
}

class SimDriveBase {
  left: SimMotor;
  right: SimMotor;
  wheelD: number;
  axle: number;
  useGyro = false;
  settings: DbSettings;
  man: DbManeuver | null = null;
  sOrigin = 0;
  hOrigin = 0;
  iS = 0;
  iH = 0;
  gains = { ...DB_GAINS };
  constructor(left: SimMotor, right: SimMotor, wheelD: number, axle: number, maxDeg: number) {
    this.left = left;
    this.right = right;
    this.wheelD = wheelD;
    this.axle = axle;
    const vmax = (maxDeg / 360) * Math.PI * wheelD;
    const wmax = ((2 * vmax) / axle) * (180 / Math.PI);
    this.settings = {
      straight_speed: Math.round(vmax * 0.4),
      straight_acceleration: Math.round(vmax * 1.2),
      turn_rate: Math.round(wmax * 0.4),
      turn_acceleration: Math.round(wmax * 1.2),
    };
  }
}

export interface SimOptions {
  profile: RobotProfile;
  start: Pose;
  seed?: number;
  maxTimeMs?: number;
  /** keep the robot inside the table walls */
  walls?: boolean;
}

export class Sim {
  readonly p: RobotProfile;
  readonly d: DerivedRobot;
  t = 0; // s, physics time
  private clockMs = 0; // program clock (ms) – advances with calls & waits
  x: number; // m
  y: number; // m
  th: number; // rad, clockwise
  v = 0; // m/s
  w = 0; // rad/s clockwise
  motors: Map<PortName, SimMotor> = new Map();
  db: SimDriveBase | null = null;
  private rand: () => number;
  private gyroNoise = 0;
  private gyroDrift = 0;
  private gyroRef = 0; // true heading (deg) at reset
  private gyroUser = 0; // user value at reset
  private stepCount = 0;
  private nextFrame = 0;
  maxTimeMs: number;
  readonly walls: boolean;
  frames: SimFrames = { t: [], x: [], y: [], h: [], gyro: [], dl: [], dr: [], vl: [], vr: [], att: {} };
  events: SimEvent[] = [];
  private lastWallT = -1;

  constructor(opts: SimOptions) {
    this.p = opts.profile;
    this.d = derive(opts.profile);
    this.x = opts.start.x / 1000;
    this.y = opts.start.y / 1000;
    this.th = (opts.start.headingDeg * Math.PI) / 180;
    this.rand = mulberry32(opts.seed ?? 7);
    this.maxTimeMs = opts.maxTimeMs ?? 150_000;
    this.walls = opts.walls ?? true;
    this.gyroRef = opts.start.headingDeg;
    this.record();
  }

  // ───────────────────────── clock ─────────────────────────
  now() {
    return this.clockMs;
  }
  /** Advance the program clock; runs physics up to it. */
  advance(ms: number) {
    if (ms > 0) this.clockMs += ms;
    const target = this.clockMs / 1000;
    while (this.t + PHYS_DT <= target + 1e-12) this.step();
    if (this.clockMs > this.maxTimeMs) throw new MatchTimeOver();
  }
  callCost() {
    this.advance(CALL_COST_MS);
  }
  /** Step until predicate is true (checked every control tick) or timeout. */
  advanceUntil(pred: () => boolean, timeoutMs: number) {
    const start = this.clockMs;
    while (!pred()) {
      if (this.clockMs - start > timeoutMs) return false;
      this.advance(5);
    }
    return true;
  }

  // ───────────────────────── devices ─────────────────────────
  motor(port: PortName, userDir: "clockwise" | "counterclockwise"): SimMotor {
    let m = this.motors.get(port);
    const side = port === this.p.leftPort ? "left" : port === this.p.rightPort ? "right" : null;
    if (!m) {
      m = new SimMotor(port, side);
      this.motors.set(port, m);
      if (!side) this.frames.att[port] = this.frames.t.map(() => 0);
    }
    if (side === "left") m.userSign = userDir === this.p.leftForward ? 1 : -1;
    else if (side === "right") m.userSign = userDir === this.p.rightForward ? 1 : -1;
    else m.userSign = userDir === "clockwise" ? 1 : -1;
    m.offset = m.userSign * (m.ang * 180) / Math.PI; // Pybricks resets angle to 0 (absolute ignored)
    return m;
  }
  getMotor(port: PortName) {
    const m = this.motors.get(port);
    if (!m) throw new Error(`No motor on port ${port}`);
    return m;
  }
  private releaseFromDriveBase(m: SimMotor) {
    if (this.db && (this.db.left === m || this.db.right === m) && this.db.man) {
      this.db.man = null;
      const other = this.db.left === m ? this.db.right : this.db.left;
      if (other.mode === "drivebase") other.mode = "coast";
    }
  }
  motorDc(port: PortName, duty: number) {
    const m = this.getMotor(port);
    this.releaseFromDriveBase(m);
    m.mode = "duty";
    m.duty = Math.max(-100, Math.min(100, Number(duty) || 0));
    m.servo = null;
  }
  motorStop(port: PortName, how: "coast" | "brake") {
    const m = this.getMotor(port);
    this.releaseFromDriveBase(m);
    m.mode = how;
    m.servo = null;
  }
  motorResetAngle(port: PortName, angle: number) {
    const m = this.getMotor(port);
    m.offset = m.userSign * (m.ang * 180) / Math.PI - angle;
    if (m.servo) m.servo.refAngle = angle;
  }
  private defaultAccel(m: SimMotor) {
    return MOTOR_SPECS[this.p.motor].maxSpeedDeg * (m.side ? 2 : 3);
  }
  motorRunAngle(port: PortName, speed: number, angle: number, then: StopMode) {
    const m = this.getMotor(port);
    const sgn = Math.sign(speed) || 1;
    const start = m.servo && m.servo.kind === "hold" ? m.servo.refAngle : m.userAngle();
    this.motorRunTarget(port, Math.abs(speed), start + sgn * angle, then);
  }
  motorRunTarget(port: PortName, speed: number, target: number, then: StopMode) {
    const m = this.getMotor(port);
    this.releaseFromDriveBase(m);
    const spec = MOTOR_SPECS[this.p.motor];
    const vmax = Math.min(Math.abs(speed), spec.maxSpeedDeg);
    const start = m.servo && m.servo.kind === "hold" ? m.servo.refAngle : m.userAngle();
    const traj = new Trapezoid(this.t, start, target - start, vmax, this.defaultAccel(m));
    m.mode = "servo";
    m.servo = { kind: "angle", traj, refAngle: start, then, integ: 0, done: false, stallT: 0, stalled: false };
  }
  motorRun(port: PortName, speed: number, untilS?: number, then: StopMode = "coast") {
    const m = this.getMotor(port);
    this.releaseFromDriveBase(m);
    const spec = MOTOR_SPECS[this.p.motor];
    const sp = Math.max(-spec.maxSpeedDeg, Math.min(spec.maxSpeedDeg, speed));
    m.mode = "servo";
    m.servo = {
      kind: "speed",
      speed: sp,
      speedRamp: m.userSpeed(),
      refAngle: m.userAngle(),
      until: untilS,
      then,
      integ: 0,
      done: false,
      stallT: 0,
      stalled: false,
    };
  }
  motorHold(port: PortName) {
    const m = this.getMotor(port);
    this.releaseFromDriveBase(m);
    m.mode = "servo";
    m.servo = { kind: "hold", refAngle: m.userAngle(), then: "hold", integ: 0, done: true, stallT: 0, stalled: false };
  }
  motorDone(port: PortName) {
    const m = this.getMotor(port);
    if (m.mode !== "servo" || !m.servo) return true;
    return m.servo.done || m.servo.stalled;
  }
  motorStalled(port: PortName) {
    const m = this.getMotor(port);
    return !!m.servo?.stalled;
  }

  // ───────────────────────── gyro ─────────────────────────
  trueHeadingDeg() {
    return (this.th * 180) / Math.PI;
  }
  gyroHeading() {
    return this.gyroUser + (this.trueHeadingDeg() - this.gyroRef) + this.gyroDrift + this.gyroNoise;
  }
  gyroReset(angle: number) {
    this.gyroRef = this.trueHeadingDeg();
    this.gyroUser = angle;
    this.gyroDrift = 0;
  }
  /** Pybricks angular_velocity(Axis.Z) is counter-clockwise positive. */
  gyroRateZ() {
    return -(this.w * 180) / Math.PI + this.gyroNoise * 5;
  }

  // ───────────────────────── drive base ─────────────────────────
  driveBase(leftPort: PortName, rightPort: PortName, wheelD: number, axle: number) {
    const l = this.getMotor(leftPort);
    const r = this.getMotor(rightPort);
    this.db = new SimDriveBase(l, r, wheelD, axle, MOTOR_SPECS[this.p.motor].maxSpeedDeg);
    return this.db;
  }
  private dbReq() {
    if (!this.db) throw new Error("DriveBase not created");
    return this.db;
  }
  dbDistance() {
    const db = this.dbReq();
    const deg = (db.left.userAngle() + db.right.userAngle()) / 2;
    return (deg / 360) * Math.PI * db.wheelD - db.sOrigin;
  }
  dbAngle() {
    const db = this.dbReq();
    if (db.useGyro) return this.gyroHeading() - db.hOrigin;
    const sl = (db.left.userAngle() / 360) * Math.PI * db.wheelD;
    const sr = (db.right.userAngle() / 360) * Math.PI * db.wheelD;
    return ((sl - sr) / db.axle) * (180 / Math.PI) - db.hOrigin;
  }
  private dbRates() {
    const db = this.dbReq();
    const vl = (db.left.userSpeed() / 360) * Math.PI * db.wheelD;
    const vr = (db.right.userSpeed() / 360) * Math.PI * db.wheelD;
    const v = (vl + vr) / 2;
    const w = db.useGyro ? -this.gyroRateZ() : ((vl - vr) / db.axle) * (180 / Math.PI);
    return { v, w };
  }
  dbReset() {
    const db = this.dbReq();
    db.sOrigin = 0;
    db.hOrigin = 0;
    db.sOrigin = this.dbDistance();
    db.hOrigin = this.dbAngle();
    db.man = null;
  }
  dbUseGyro(on: boolean) {
    const db = this.dbReq();
    const before = this.dbAngle();
    db.useGyro = on;
    db.hOrigin = 0;
    db.hOrigin = this.dbAngle() - before;
  }
  private dbStartRefs() {
    const db = this.dbReq();
    if (db.man && (db.man.kind === "hold" || db.man.done)) return { s: db.man.sRef, h: db.man.hRef };
    if (db.man) return { s: db.man.sRef, h: db.man.hRef };
    return { s: this.dbDistance(), h: this.dbAngle() };
  }
  private dbTake() {
    const db = this.dbReq();
    db.left.mode = "drivebase";
    db.right.mode = "drivebase";
    db.left.servo = null;
    db.right.servo = null;
    db.iS = 0;
    db.iH = 0;
  }
  dbStraight(dist: number, then: StopMode) {
    const db = this.dbReq();
    const { s, h } = this.dbStartRefs();
    this.dbTake();
    const st = db.settings;
    const traj = new Trapezoid(this.t, s, dist, st.straight_speed, st.straight_acceleration);
    db.man = { kind: "straight", s: traj, sRef: s, hRef: h, then, end: traj.end, done: false };
  }
  dbTurn(angle: number, then: StopMode) {
    const db = this.dbReq();
    const { s, h } = this.dbStartRefs();
    this.dbTake();
    const st = db.settings;
    const traj = new Trapezoid(this.t, h, angle, st.turn_rate, st.turn_acceleration);
    db.man = { kind: "turn", h: traj, sRef: s, hRef: h, then, end: traj.end, done: false };
  }
  dbCurve(radius: number, angle: number, then: StopMode) {
    const db = this.dbReq();
    const { s, h } = this.dbStartRefs();
    this.dbTake();
    const st = db.settings;
    const arcRateDeg = ((st.straight_speed / Math.max(1, Math.abs(radius))) * 180) / Math.PI;
    const rate = Math.min(st.turn_rate, arcRateDeg);
    const traj = new Trapezoid(this.t, h, angle * Math.sign(radius || 1), rate, st.turn_acceleration);
    db.man = {
      kind: "curve", h: traj, curveRadius: Math.abs(radius), curveH0: h, curveS0: s,
      sRef: s, hRef: h, then, end: traj.end, done: false,
    };
  }
  dbDrive(speed: number, rate: number) {
    const db = this.dbReq();
    const cont = db.man && db.man.kind === "drive";
    const { s, h } = this.dbStartRefs();
    const { v, w } = this.dbRates();
    if (!cont) this.dbTake();
    db.man = {
      kind: "drive", driveSpeed: speed, driveRate: rate,
      curSpeed: cont ? db.man!.curSpeed : v, curRate: cont ? db.man!.curRate : w,
      sRef: cont ? db.man!.sRef : s, hRef: cont ? db.man!.hRef : h,
      then: "coast", end: Infinity, done: true,
    };
  }
  dbStop(how: "coast" | "brake") {
    const db = this.dbReq();
    db.man = null;
    db.left.mode = how;
    db.right.mode = how;
  }
  dbDone() {
    const db = this.dbReq();
    return !db.man || db.man.done;
  }

  private dbControl() {
    const db = this.db!;
    const man = db.man;
    if (!man || db.left.mode !== "drivebase") return;
    const t = this.t;
    const st = db.settings;
    let vRef = 0;
    let wRef = 0;
    const dtc = PHYS_DT * CONTROL_EVERY;
    if (man.kind === "straight") {
      man.sRef = man.s!.pos(t);
      vRef = man.s!.vel(t);
    } else if (man.kind === "turn") {
      man.hRef = man.h!.pos(t);
      wRef = man.h!.vel(t);
    } else if (man.kind === "curve") {
      man.hRef = man.h!.pos(t);
      wRef = man.h!.vel(t);
      const k = (man.curveRadius! * Math.PI) / 180;
      man.sRef = man.curveS0! + Math.abs(man.hRef - man.curveH0!) * k;
      vRef = Math.abs(wRef) * k;
    } else if (man.kind === "drive") {
      const ds = st.straight_acceleration * dtc;
      const dw = st.turn_acceleration * dtc;
      man.curSpeed = man.curSpeed! + Math.max(-ds, Math.min(ds, man.driveSpeed! - man.curSpeed!));
      man.curRate = man.curRate! + Math.max(-dw, Math.min(dw, man.driveRate! - man.curRate!));
      vRef = man.curSpeed!;
      wRef = man.curRate!;
      man.sRef += vRef * dtc;
      man.hRef += wRef * dtc;
    }
    const sMeas = this.dbDistance();
    const hMeas = this.dbAngle();
    const { v, w } = this.dbRates();
    const eS = man.sRef - sMeas;
    const eH = man.hRef - hMeas;
    const spec = MOTOR_SPECS[this.p.motor];
    const maxDegAtV = spec.maxSpeedDeg * this.d.kV;
    const mmToDeg = 360 / (Math.PI * db.wheelD);
    const hToDeg = db.axle / db.wheelD; // motor degrees per heading degree
    const g = db.gains;
    // Integrators only work once the trajectory has finished (no wind-up while moving).
    const settling = t >= man.end || man.kind === "hold";
    if (settling) {
      db.iS = Math.max(-25 / g.kiS, Math.min(25 / g.kiS, db.iS + eS * mmToDeg * dtc));
      db.iH = Math.max(-25 / g.kiH, Math.min(25 / g.kiH, db.iH + eH * hToDeg * dtc));
    }
    const ffS = (100 * vRef * mmToDeg) / maxDegAtV;
    const ffH = (100 * wRef * hToDeg) / maxDegAtV;
    const fric = (100 * spec.frictionTorque) / (spec.stallTorque * this.d.kV);
    const uS = ffS + g.kpS * eS * mmToDeg + g.kdS * (vRef - v) * mmToDeg + g.kiS * db.iS + (vRef !== 0 ? Math.sign(vRef) * fric : 0);
    const uH = ffH + g.kpH * eH * hToDeg + g.kdH * (wRef - w) * hToDeg + g.kiH * db.iH + (wRef !== 0 ? Math.sign(wRef) * fric : 0);
    db.left.duty = Math.max(-100, Math.min(100, uS + uH));
    db.right.duty = Math.max(-100, Math.min(100, uS - uH));

    if (!man.done && t >= man.end) {
      const okS = Math.abs(eS * mmToDeg) < 6 && Math.abs(v * mmToDeg) < 30;
      const okH = Math.abs(eH) < 0.6 && Math.abs(w) < 15;
      if ((okS && okH) || t > man.end + 1.5) {
        man.done = true;
        if (man.then === "coast" || man.then === "brake") {
          db.left.mode = man.then;
          db.right.mode = man.then;
          db.man = null;
        } else if (man.then === "none") {
          db.man = null;
          db.left.mode = "duty";
          db.right.mode = "duty";
        } else {
          man.kind = "hold";
        }
      }
    }
  }

  private servoControl(m: SimMotor) {
    const s = m.servo;
    if (!s) return;
    const t = this.t;
    const dtc = PHYS_DT * CONTROL_EVERY;
    const spec = MOTOR_SPECS[this.p.motor];
    const maxDegAtV = spec.maxSpeedDeg * this.d.kV;
    let ref = s.refAngle;
    let vRef = 0;
    if (s.kind === "angle" && s.traj) {
      ref = s.traj.pos(t);
      vRef = s.traj.vel(t);
    } else if (s.kind === "speed") {
      const acc = this.defaultAccel(m) * dtc;
      s.speedRamp = s.speedRamp! + Math.max(-acc, Math.min(acc, s.speed! - s.speedRamp!));
      vRef = s.speedRamp!;
      ref = s.refAngle + vRef * dtc;
      if (s.until !== undefined && t >= s.until) {
        s.done = true;
        this.applyThen(m, s.then);
        return;
      }
    }
    s.refAngle = ref;
    const ang = m.userAngle();
    const e = ref - ang;
    const kp = m.side ? 1.0 : 1.6;
    const kd = m.side ? 0.022 : 0.03;
    const ki = 1.2;
    s.integ = Math.max(-30 / ki, Math.min(30 / ki, s.integ + e * dtc));
    const fric = (100 * spec.frictionTorque) / (spec.stallTorque * this.d.kV);
    let u = (100 * vRef) / maxDegAtV + kp * e + kd * (vRef - m.userSpeed()) + ki * s.integ;
    if (vRef !== 0) u += Math.sign(vRef) * fric;
    m.duty = Math.max(-100, Math.min(100, u));
    // stall detection
    if (Math.abs(m.duty) > 60 && Math.abs(m.userSpeed()) < 15) s.stallT += dtc;
    else s.stallT = 0;
    if (s.stallT > 0.25) s.stalled = true;
    if (s.kind === "angle" && s.traj && !s.done && t >= s.traj.end) {
      if ((Math.abs(e) < 4 && Math.abs(m.userSpeed()) < 40) || t > s.traj.end + 1.0 || s.stalled) {
        s.done = true;
        this.applyThen(m, s.then);
      }
    }
  }
  private applyThen(m: SimMotor, then: StopMode) {
    if (then === "coast" || then === "brake") {
      m.mode = then;
      m.servo = { ...m.servo!, done: true };
    } else if (then === "hold") {
      m.servo = { ...m.servo!, kind: "hold", refAngle: m.servo!.kind === "angle" && m.servo!.traj ? m.servo!.traj.pos(Infinity) : m.userAngle(), done: true };
    } else {
      // Stop.NONE: keep last duty but treat as done
      m.mode = "duty";
    }
  }

  // ───────────────────────── physics ─────────────────────────
  private motorTorque(m: SimMotor, wPhys: number, stallMul: number) {
    const spec = MOTOR_SPECS[this.p.motor];
    const tauS = spec.stallTorque * stallMul;
    const w0 = spec.noLoadSpeed;
    let dutyPhys = 0;
    switch (m.mode) {
      case "coast":
        m.appliedPhys = 0;
        return 0;
      case "brake":
        m.appliedPhys = 0;
        return -tauS * (wPhys / w0);
      default:
        dutyPhys = m.userSign * m.duty;
    }
    m.appliedPhys = dutyPhys;
    return tauS * ((dutyPhys / 100) * this.d.kV - wPhys / w0);
  }

  private step() {
    const d = this.d;
    const dt = PHYS_DT;
    if (this.stepCount % CONTROL_EVERY === 0) {
      for (const m of this.motors.values()) if (m.mode === "servo") this.servoControl(m);
      if (this.db) this.dbControl();
    }
    this.stepCount++;

    const spec = d.spec;
    const T = d.T;
    const r = d.r;
    const rR = r * (1 - (this.p.wheelMismatchPct ?? 0) / 100);
    const vl = this.v + (this.w * T) / 2;
    const vr = this.v - (this.w * T) / 2;
    const left = this.motors.get(this.p.leftPort);
    const right = this.motors.get(this.p.rightPort);
    const mismatch = 1 - this.p.motorMismatchPct / 100;
    const tauL = left ? this.motorTorque(left, vl / r, 1) : 0;
    const tauR = right ? this.motorTorque(right, vr / rR, mismatch) : 0;
    const wheelN = (d.m * 9.81 * this.p.wheelLoadShare) / 2;
    const fMax = 1.0 * wheelN;
    const FL = Math.max(-fMax, Math.min(fMax, tauL / r));
    const FR = Math.max(-fMax, Math.min(fMax, tauR / rR));
    const fm = spec.frictionTorque / r; // per wheel
    const smooth = (x: number, s: number) => Math.tanh(x / s);
    const FfL = fm * smooth(vl, 0.004);
    const FfR = fm * smooth(vr, 0.004);

    // linear channel (Karnopp stick-slip)
    const Fdrive = FL + FR;
    const FsV = d.rollingForce + 2 * fm;
    let av: number;
    if (Math.abs(this.v) < 0.002 && Math.abs(Fdrive) <= FsV) {
      this.v = 0;
      av = 0;
    } else {
      const dir = Math.abs(this.v) < 0.002 ? Math.sign(Fdrive) : Math.sign(this.v);
      const Ff = d.rollingForce * dir + (Math.abs(this.v) < 0.002 ? 2 * fm * dir : FfL + FfR);
      av = (Fdrive - Ff) / d.Meff;
    }
    // yaw channel. While the robot rolls, the tyres are already moving, so
    // there is no breakaway torque for yaw – only a smaller, smooth scrub.
    const tauDrive = ((FL - FR) * T) / 2;
    const rolling = Math.abs(this.v) >= 0.002;
    const TsW = d.scrubTorque + (2 * fm * T) / 2;
    let aw: number;
    if (!rolling && Math.abs(this.w) < 0.01 && Math.abs(tauDrive) <= TsW) {
      this.w = 0;
      aw = 0;
    } else if (rolling) {
      const Tf = 0.08 * d.scrubTorque * smooth(this.w, 0.05) + ((FfL - FfR) * T) / 2;
      aw = (tauDrive - Tf) / d.Jeff;
    } else {
      const dir = Math.abs(this.w) < 0.01 ? Math.sign(tauDrive) : Math.sign(this.w);
      const Tf = d.scrubTorque * dir + (Math.abs(this.w) < 0.01 ? ((2 * fm * T) / 2) * dir : ((FfL - FfR) * T) / 2);
      aw = (tauDrive - Tf) / d.Jeff;
    }
    const v0 = this.v;
    const w0 = this.w;
    this.v += av * dt;
    this.w += aw * dt;
    // friction cannot reverse motion within one step
    if (v0 !== 0 && Math.sign(this.v) !== Math.sign(v0) && Math.abs(Fdrive) <= FsV) this.v = 0;
    if (!rolling && w0 !== 0 && Math.sign(this.w) !== Math.sign(w0) && Math.abs(tauDrive) <= TsW) this.w = 0;

    this.th += this.w * dt;
    this.x += this.v * Math.cos(this.th) * dt;
    this.y += this.v * Math.sin(this.th) * dt;
    const nvl = this.v + (this.w * T) / 2;
    const nvr = this.v - (this.w * T) / 2;
    if (left) {
      left.w = nvl / r;
      left.ang += left.w * dt;
    }
    if (right) {
      right.w = nvr / rR;
      right.ang += right.w * dt;
    }

    // attachment motors
    for (const m of this.motors.values()) {
      if (m.side) continue;
      const J = spec.rotorInertia + m.loadInertia;
      const tau = this.motorTorque(m, m.w, 1);
      const tf = spec.frictionTorque;
      if (Math.abs(m.w) < 0.02 && Math.abs(tau) <= tf) {
        m.w = 0;
      } else {
        const dir = Math.abs(m.w) < 0.02 ? Math.sign(tau) : Math.sign(m.w);
        const wPrev = m.w;
        m.w += ((tau - tf * dir) / J) * dt;
        if (wPrev !== 0 && Math.sign(m.w) !== Math.sign(wPrev) && Math.abs(tau) <= tf) m.w = 0;
      }
      m.ang += m.w * dt;
    }

    if (this.walls) this.collide();

    // gyro: slow coloured noise + drift
    const a = 0.998;
    const g = this.gauss();
    this.gyroNoise = a * this.gyroNoise + this.p.gyroNoiseDeg * Math.sqrt(1 - a * a) * g;
    this.gyroDrift += (this.p.gyroDriftDegPerMin / 60) * dt;

    this.t += dt;
    if (this.t * 1000 >= this.nextFrame - 1e-9) this.record();
  }

  private gauss() {
    const u = Math.max(1e-12, this.rand());
    const v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Corners of the robot footprint in table mm. */
  footprint(): [number, number][] {
    const p = this.p;
    const front = p.axleToFrontMm / 1000;
    const back = (p.lengthMm - p.axleToFrontMm) / 1000;
    const half = p.widthMm / 2000;
    const c = Math.cos(this.th);
    const s = Math.sin(this.th);
    const pts: [number, number][] = [
      [front, -half],
      [front, half],
      [-back, half],
      [-back, -half],
    ];
    return pts.map(([fx, fy]) => [(this.x + fx * c - fy * s) * 1000, (this.y + fx * s + fy * c) * 1000]);
  }

  private collide() {
    const pts = this.footprint();
    let dx = 0;
    let dy = 0;
    for (const [px, py] of pts) {
      if (px < 0) dx = Math.max(dx, -px);
      if (px > TABLE_W) dx = Math.min(dx, TABLE_W - px);
      if (py < 0) dy = Math.max(dy, -py);
      if (py > TABLE_H) dy = Math.min(dy, TABLE_H - py);
    }
    if (dx !== 0 || dy !== 0) {
      this.x += dx / 1000;
      this.y += dy / 1000;
      // the wall absorbs the motion component into it
      const fx = Math.cos(this.th);
      const fy = Math.sin(this.th);
      const into = (dx !== 0 ? -Math.sign(dx) * fx : 0) + (dy !== 0 ? -Math.sign(dy) * fy : 0);
      if (into * this.v > 0) this.v *= 0.2;
      this.w *= 0.6;
      if (this.t - this.lastWallT > 0.5) {
        this.events.push({ t: this.clockMs, kind: "wall", text: "Robot hit the table wall" });
      }
      this.lastWallT = this.t;
    }
  }

  private record() {
    const f = this.frames;
    const T = this.d.T;
    f.t.push(Math.round(this.t * 1000));
    f.x.push(this.x * 1000);
    f.y.push(this.y * 1000);
    f.h.push(this.trueHeadingDeg());
    f.gyro.push(this.gyroHeading());
    const l = this.motors.get(this.p.leftPort);
    const r = this.motors.get(this.p.rightPort);
    f.dl.push(l ? l.appliedPhys : 0);
    f.dr.push(r ? r.appliedPhys : 0);
    f.vl.push((this.v + (this.w * T) / 2) * 1000);
    f.vr.push((this.v - (this.w * T) / 2) * 1000);
    for (const [port, arr] of Object.entries(this.frames.att)) {
      const m = this.motors.get(port as PortName);
      arr.push(m ? m.userAngle() : 0);
    }
    this.nextFrame += FRAME_MS;
  }

  pose(): Pose {
    return { x: this.x * 1000, y: this.y * 1000, headingDeg: this.trueHeadingDeg() };
  }

  /** Ultrasonic sensor looking forward from the robot's front: distance to wall (mm). */
  ultrasonic(): number {
    const front = this.p.axleToFrontMm;
    const sx = this.x * 1000 + front * Math.cos(this.th);
    const sy = this.y * 1000 + front * Math.sin(this.th);
    const cx = Math.cos(this.th);
    const cy = Math.sin(this.th);
    let best = 2000;
    const tryT = (t: number) => {
      if (t > 0 && t < best) best = t;
    };
    if (cx > 1e-6) tryT((TABLE_W - sx) / cx);
    if (cx < -1e-6) tryT(-sx / cx);
    if (cy > 1e-6) tryT((TABLE_H - sy) / cy);
    if (cy < -1e-6) tryT(-sy / cy);
    return Math.round(best);
  }

  log(kind: SimEvent["kind"], text: string) {
    this.events.push({ t: this.clockMs, kind, text });
    if (this.events.length > 2000) this.events.splice(0, 500);
  }

  result(error?: string): SimResult {
    return { frames: this.frames, events: this.events, endTime: this.clockMs, finalPose: this.pose(), error };
  }
}

export function isMatchTimeOver(e: unknown) {
  return e instanceof MatchTimeOver || (e instanceof Error && e.message.includes("MATCH_TIME_OVER"));
}
