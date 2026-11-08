// Robot builder model: a top view of the robot made of SPIKE Prime parts.
// From where each part sits we compute mass, centre of mass, turning inertia
// and how much weight the drive wheels carry — the numbers that decide how
// the robot turns and therefore how LQR / PID must be tuned.
//
// Robot frame: x = forward (mm), y = right (mm), origin = middle of the wheel axle.

import type { RobotProfile } from "../sim/robot";

export type PartKind = "hub" | "motorL" | "motorM" | "colorSensor" | "distanceSensor" | "forceSensor" | "frame" | "attachment";

export interface Part {
  id: string;
  kind: PartKind;
  x: number; // centre, forward
  y: number; // centre, right
  len: number; // size along x
  wid: number; // size along y
  mass: number; // g
  name?: string;
}

export interface RobotBuild {
  parts: Part[];
  wheelDiameterMm: number;
  axleTrackMm: number;
  driveMotor: "medium" | "large";
  caster: "ball" | "skid";
  casterX: number; // mm, + in front of the axle
  /** kitchen-scale reading; scales every part so the total matches */
  measuredMassG?: number;
}

export interface PartSpec {
  len: number;
  wid: number;
  mass: number;
  resizable?: boolean;
}

// Approximate SPIKE Prime part sizes (1 stud = 8 mm) and masses.
export const PART_SPECS: Record<PartKind, PartSpec> = {
  hub: { len: 88, wid: 56, mass: 158 },
  motorL: { len: 56, wid: 40, mass: 62 },
  motorM: { len: 48, wid: 32, mass: 42 },
  colorSensor: { len: 24, wid: 24, mass: 12 },
  distanceSensor: { len: 24, wid: 56, mass: 18 },
  forceSensor: { len: 24, wid: 24, mass: 16 },
  frame: { len: 160, wid: 120, mass: 0, resizable: true }, // mass from area
  attachment: { len: 48, wid: 64, mass: 60, resizable: true },
};

/** Beams + pins: about 6 g per 1000 mm² of chassis outline. */
export const FRAME_G_PER_MM2 = 0.006;

export function wheelWidth(d: number) {
  if (d <= 58) return 14;
  if (d <= 70) return 20;
  return 28;
}
export function wheelMass(d: number) {
  return Math.round(12 + ((d - 56) / 32) * 18);
}
export const CASTER_MASS = 10;

export function driveMotorSpec(b: RobotBuild) {
  return PART_SPECS[b.driveMotor === "large" ? "motorL" : "motorM"];
}

/** The fixed parts: two wheels and two drive motors, placed by the axle track. */
export function fixedParts(b: RobotBuild) {
  const ww = wheelWidth(b.wheelDiameterMm);
  const ms = driveMotorSpec(b);
  const yWheel = b.axleTrackMm / 2;
  const yMotor = Math.max(ms.wid / 2 + 4, yWheel - ww / 2 - 4 - ms.wid / 2);
  const xMotor = -(ms.len / 2 - 14); // output shaft ~14 mm from the front of the motor
  return {
    wheels: [
      { y: -yWheel, len: b.wheelDiameterMm, wid: ww, mass: wheelMass(b.wheelDiameterMm) },
      { y: yWheel, len: b.wheelDiameterMm, wid: ww, mass: wheelMass(b.wheelDiameterMm) },
    ],
    motors: [
      { x: xMotor, y: -yMotor, len: ms.len, wid: ms.wid, mass: ms.mass },
      { x: xMotor, y: yMotor, len: ms.len, wid: ms.wid, mass: ms.mass },
    ],
  };
}

export interface BuildStats {
  massG: number;
  computedMassG: number;
  com: { x: number; y: number };
  inertiaKgM2: number;
  lengthMm: number;
  widthMm: number;
  axleToFrontMm: number;
  wheelLoadShare: number;
  warnings: ("tipBack" | "tipFront" | "lightWheels" | "offCenter")[];
}

export function buildStats(b: RobotBuild): BuildStats {
  const f = fixedParts(b);
  type M = { x: number; y: number; len: number; wid: number; mass: number };
  const masses: M[] = [
    ...f.wheels.map((w) => ({ x: 0, ...w })),
    ...f.motors,
    { x: b.casterX, y: 0, len: 24, wid: 24, mass: CASTER_MASS },
    ...b.parts.map((p) => ({ x: p.x, y: p.y, len: p.len, wid: p.wid, mass: p.kind === "frame" ? Math.round(p.len * p.wid * FRAME_G_PER_MM2) : p.mass })),
  ];
  const computed = masses.reduce((s, m) => s + m.mass, 0);
  const k = b.measuredMassG && b.measuredMassG > 50 ? b.measuredMassG / computed : 1;
  let mx = 0;
  let my = 0;
  for (const m of masses) {
    mx += m.mass * m.x;
    my += m.mass * m.y;
  }
  const com = { x: mx / computed, y: my / computed };
  // turning inertia about the axle centre (spin turns rotate around it)
  let J = 0;
  for (const m of masses) {
    const kg = (m.mass * k) / 1000;
    const x = m.x / 1000;
    const y = m.y / 1000;
    J += kg * (x * x + y * y) + (kg * ((m.len / 1000) ** 2 + (m.wid / 1000) ** 2)) / 12;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const m of masses) {
    minX = Math.min(minX, m.x - m.len / 2);
    maxX = Math.max(maxX, m.x + m.len / 2);
    minY = Math.min(minY, m.y - m.wid / 2);
    maxY = Math.max(maxY, m.y + m.wid / 2);
  }
  // lever rule between axle (x = 0) and caster
  const cx = b.casterX === 0 ? 1 : b.casterX;
  const raw = 1 - com.x / cx;
  const warnings: BuildStats["warnings"] = [];
  if (raw > 1.02) warnings.push(b.casterX > 0 ? "tipBack" : "tipFront");
  if (raw < 0.5) warnings.push("lightWheels");
  if (Math.abs(com.y) > 12) warnings.push("offCenter");
  return {
    massG: Math.round(computed * k),
    computedMassG: Math.round(computed),
    com,
    inertiaKgM2: J,
    lengthMm: Math.round(maxX - minX),
    widthMm: Math.round(maxY - minY),
    axleToFrontMm: Math.round(maxX),
    wheelLoadShare: Math.min(1, Math.max(0.4, raw)),
    warnings,
  };
}

/** Write the builder's numbers into a robot profile. */
export function applyBuild(p: RobotProfile, b: RobotBuild): RobotProfile {
  const s = buildStats(b);
  return {
    ...p,
    build: b,
    massG: s.massG,
    lengthMm: s.lengthMm,
    widthMm: s.widthMm,
    axleToFrontMm: s.axleToFrontMm,
    wheelDiameterMm: b.wheelDiameterMm,
    axleTrackMm: b.axleTrackMm,
    motor: b.driveMotor,
    caster: b.caster,
    wheelLoadShare: +s.wheelLoadShare.toFixed(2),
    inertiaKgM2: s.inertiaKgM2,
  };
}

let n = 0;
export const partId = () => `p${Date.now().toString(36)}${(n++).toString(36)}`;

export function newPart(kind: PartKind, x = 40, y = 0): Part {
  const s = PART_SPECS[kind];
  return { id: partId(), kind, x, y, len: s.len, wid: s.wid, mass: s.mass };
}

/** A typical FLL robot with 88 mm wheels — the starting point for new teams. */
export function defaultBuild(): RobotBuild {
  return {
    wheelDiameterMm: 88,
    axleTrackMm: 112,
    driveMotor: "medium",
    caster: "ball",
    casterX: -72,
    parts: [
      { id: "frame1", kind: "frame", x: 16, y: 0, len: 208, wid: 160, mass: 0 },
      { id: "hub1", kind: "hub", x: -4, y: 0, len: 88, wid: 56, mass: 158 },
      { id: "mA", kind: "motorM", x: 84, y: -44, len: 48, wid: 32, mass: 42 },
      { id: "mE", kind: "motorM", x: 84, y: 44, len: 48, wid: 32, mass: 42 },
      { id: "col1", kind: "colorSensor", x: 104, y: 0, len: 24, wid: 24, mass: 12 },
      { id: "arm1", kind: "attachment", x: 132, y: 0, len: 32, wid: 96, mass: 70 },
    ],
  };
}

export const TEMPLATES: { id: string; build: () => RobotBuild }[] = [
  { id: "big", build: defaultBuild },
  {
    id: "compact",
    build: () => ({
      wheelDiameterMm: 56,
      axleTrackMm: 96,
      driveMotor: "medium",
      caster: "ball",
      casterX: 88,
      parts: [
        { id: "frame1", kind: "frame", x: 40, y: 0, len: 176, wid: 128, mass: 0 },
        { id: "hub1", kind: "hub", x: 44, y: 0, len: 88, wid: 56, mass: 158 },
        { id: "mA", kind: "motorM", x: -24, y: -32, len: 48, wid: 32, mass: 42 },
        { id: "mE", kind: "motorM", x: -24, y: 32, len: 48, wid: 32, mass: 42 },
        { id: "col1", kind: "colorSensor", x: 116, y: 0, len: 24, wid: 24, mass: 12 },
      ],
    }),
  },
  {
    id: "heavy",
    build: () => ({
      wheelDiameterMm: 88,
      axleTrackMm: 136,
      driveMotor: "large",
      caster: "skid",
      casterX: -96,
      parts: [
        { id: "frame1", kind: "frame", x: 8, y: 0, len: 256, wid: 184, mass: 0 },
        { id: "hub1", kind: "hub", x: -16, y: 0, len: 88, wid: 56, mass: 158 },
        { id: "mA", kind: "motorL", x: 92, y: -48, len: 56, wid: 40, mass: 62 },
        { id: "mE", kind: "motorL", x: 92, y: 48, len: 56, wid: 40, mass: 62 },
        { id: "col1", kind: "colorSensor", x: 116, y: -16, len: 24, wid: 24, mass: 12 },
        { id: "col2", kind: "colorSensor", x: 116, y: 16, len: 24, wid: 24, mass: 12 },
        { id: "arm1", kind: "attachment", x: 148, y: 0, len: 40, wid: 128, mass: 120 },
      ],
    }),
  },
];

/** A builder layout for an older profile that only had numbers. */
export function buildFromProfile(p: RobotProfile): RobotBuild {
  const b = defaultBuild();
  return {
    ...b,
    wheelDiameterMm: p.wheelDiameterMm,
    axleTrackMm: p.axleTrackMm,
    driveMotor: p.motor,
    caster: p.caster,
    measuredMassG: p.massG,
  };
}
