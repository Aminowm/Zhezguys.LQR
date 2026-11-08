// Robot profile: everything the simulator and the auto-tuner need to know
// about a team's SPIKE Prime robot. Units are the ones teams can measure
// with a ruler and a kitchen scale (grams, millimetres).

import type { RobotBuild } from "../robot/build";

export type MotorKind = "medium" | "large";
export type CasterKind = "ball" | "skid";
export type PortName = "A" | "B" | "C" | "D" | "E" | "F";

export interface RobotProfile {
  name: string;
  massG: number;
  wheelDiameterMm: number;
  axleTrackMm: number;
  lengthMm: number;
  widthMm: number;
  /** distance from the wheel axle to the robot's front edge */
  axleToFrontMm: number;
  motor: MotorKind;
  caster: CasterKind;
  /** share of weight carried by the drive wheels (0.5–1) */
  wheelLoadShare: number;
  batteryPct: number;
  /** right drive motor is this % weaker than the left (real motors are never equal) */
  motorMismatchPct: number;
  /** right wheel is this % smaller than the left (tyre wear, different rims) */
  wheelMismatchPct: number;
  /** how hard the tyres resist spinning on the spot (1 = normal, from calibration) */
  scrubScale: number;
  /** multiplies the estimated turning inertia (1 = normal, from calibration) */
  inertiaScale: number;
  gyroNoiseDeg: number;
  gyroDriftDegPerMin: number;
  leftPort: PortName;
  rightPort: PortName;
  /** Direction that makes the left/right wheel go forward with a positive power */
  leftForward: "clockwise" | "counterclockwise";
  rightForward: "clockwise" | "counterclockwise";
  /** turning inertia from the robot builder (kg·m²); box estimate if missing */
  inertiaKgM2?: number;
  /** the robot builder layout this profile came from */
  build?: RobotBuild;
}

/** Zhezguys' robot as described by the default code (88 mm wheels, 112 mm track). */
export const DEFAULT_PROFILE: RobotProfile = {
  name: "Zhezguys default",
  massG: 1050,
  wheelDiameterMm: 88,
  axleTrackMm: 112,
  lengthMm: 200,
  widthMm: 165,
  axleToFrontMm: 120,
  motor: "medium",
  caster: "ball",
  wheelLoadShare: 0.75,
  batteryPct: 90,
  motorMismatchPct: 2,
  wheelMismatchPct: 0.6,
  scrubScale: 1,
  inertiaScale: 1,
  gyroNoiseDeg: 0.04,
  gyroDriftDegPerMin: 0.2,
  leftPort: "B",
  rightPort: "F",
  leftForward: "counterclockwise",
  rightForward: "clockwise",
};

export interface MotorSpec {
  stallTorque: number; // N·m at nominal voltage
  noLoadSpeed: number; // rad/s at nominal voltage
  frictionTorque: number; // N·m internal gear friction
  rotorInertia: number; // kg·m², reflected to output shaft
  maxSpeedDeg: number; // deg/s, Pybricks max speed
}

// LEGO published specs: medium 185 rpm / 18 N·cm stall, large 175 rpm / 25 N·cm stall.
export const MOTOR_SPECS: Record<MotorKind, MotorSpec> = {
  medium: {
    stallTorque: 0.18,
    noLoadSpeed: (185 / 60) * 2 * Math.PI,
    frictionTorque: 0.007,
    rotorInertia: 1.8e-5,
    maxSpeedDeg: 1110,
  },
  large: {
    stallTorque: 0.25,
    noLoadSpeed: (175 / 60) * 2 * Math.PI,
    frictionTorque: 0.010,
    rotorInertia: 2.6e-5,
    maxSpeedDeg: 1050,
  },
};

export const G = 9.81;

/** Physical constants derived from a profile, in SI units. */
export interface DerivedRobot {
  m: number;
  r: number; // wheel radius m
  T: number; // axle track m
  J: number; // yaw inertia kg·m²
  Jw: number; // per-wheel rotating inertia (rotor + wheel)
  Meff: number;
  Jeff: number;
  spec: MotorSpec;
  kV: number; // battery voltage / nominal
  rollingForce: number; // N, total rolling resistance
  scrubTorque: number; // N·m, resistance to turning on the spot
  vMax: number; // mm/s straight at 100 %
  wMaxDeg: number; // deg/s spin at 100 %
  yawA: number; // yaw plant: dω/dt = a ω + b u  (u in %)
  yawB: number; // deg/s² per %
  linA: number; // linear plant: dv/dt = a v + b u
  linB: number; // mm/s² per %
}

export function derive(p: RobotProfile): DerivedRobot {
  const spec = MOTOR_SPECS[p.motor];
  const m = Math.max(0.2, p.massG / 1000);
  const r = p.wheelDiameterMm / 2000;
  const T = p.axleTrackMm / 1000;
  const L = p.lengthMm / 1000;
  const W = p.widthMm / 1000;
  // Box approximation, slightly reduced because the hub and motors sit near the middle.
  const J = (p.inertiaKgM2 && p.inertiaKgM2 > 0 ? p.inertiaKgM2 : (0.85 * m * (L * L + W * W)) / 12) * (p.inertiaScale ?? 1);
  const wheelMass = 0.025 * Math.pow(p.wheelDiameterMm / 88, 2);
  const Jw = spec.rotorInertia + 0.65 * wheelMass * r * r;
  const Meff = m + (2 * Jw) / (r * r);
  const Jeff = J + (2 * Jw * (T / 2) * (T / 2)) / (r * r);
  const volts = 7.2 + 1.1 * (Math.min(100, Math.max(0, p.batteryPct)) / 100);
  const kV = volts / 8.3;
  const share = Math.min(1, Math.max(0.4, p.wheelLoadShare));
  const casterLoad = m * G * (1 - share);
  const wheelLoad = m * G * share;
  const casterArm = Math.max(0.03, L * 0.55);
  const rollingForce = 0.012 * wheelLoad + (p.caster === "ball" ? 0.05 : 0.3) * casterLoad;
  // Tyre scrub when spinning on the spot + caster resistance at its lever arm.
  const scrubTorque =
    (0.9 * wheelLoad * 0.0025 + (p.caster === "ball" ? 0.04 : 0.3) * casterLoad * casterArm) * (p.scrubScale ?? 1);

  const tauS = spec.stallTorque;
  const w0 = spec.noLoadSpeed;
  const vMax = w0 * kV * r * 1000;
  const wMaxDeg = ((2 * vMax) / 1000 / T) * (180 / Math.PI);
  const yawA = (-2 * tauS * (T / 2) * (T / 2)) / (Jeff * r * r * w0);
  const yawB = ((2 * (tauS / r) * (T / 2) * kV) / Jeff / 100) * (180 / Math.PI);
  const linA = (-2 * tauS) / (Meff * r * r * w0);
  const linB = ((2 * (tauS / r) * kV) / Meff / 100) * 1000;
  return {
    m, r, T, J, Jw, Meff, Jeff, spec, kV, rollingForce, scrubTorque,
    vMax, wMaxDeg, yawA, yawB, linA, linB,
  };
}

/** Minimum power (%) that starts a turn on the spot for this robot. */
export function breakawayTurnPower(p: RobotProfile): number {
  const d = derive(p);
  const tauS = d.spec.stallTorque;
  // Need wheel force pair to beat scrub + motor friction.
  const motorFrictionYaw = 2 * (d.spec.frictionTorque / d.r) * (d.T / 2);
  const need = d.scrubTorque + motorFrictionYaw;
  const perPct = (2 * (tauS / d.r) * (d.T / 2) * d.kV) / 100;
  return need / perPct;
}

/** Minimum power (%) that starts the robot rolling forward. */
export function breakawayDrivePower(p: RobotProfile): number {
  const d = derive(p);
  const need = d.rollingForce + (2 * d.spec.frictionTorque) / d.r;
  const perPct = (2 * (d.spec.stallTorque / d.r) * d.kV) / 100;
  return need / perPct;
}

export function mmToMotorDeg(mm: number, wheelDiameterMm: number) {
  return (mm / (Math.PI * wheelDiameterMm)) * 360;
}
export function motorDegToMm(deg: number, wheelDiameterMm: number) {
  return (deg / 360) * Math.PI * wheelDiameterMm;
}
