// Robot builder model: the robot made of real LEGO / SPIKE Prime parts.
// From where each part sits (in 3D) we compute mass, centre of mass, turning
// inertia and how much weight the drive wheels carry — the numbers that decide
// how the robot turns and therefore how LQR / PID must be tuned.
//
// Robot frame: x = forward (mm), y = right (mm), z = up (mm, 0 = floor),
// origin (x, y) = middle of the wheel axle.

import type { RobotProfile } from "../sim/robot";
import { CATALOG_BY_ID, CatalogItem, partMass } from "./catalog";

export type PartKind =
  | "hub" | "motorL" | "motorM" | "colorSensor" | "distanceSensor" | "forceSensor"
  | "frame" | "attachment" | "beam" | "openFrame" | "brick";

export interface Part {
  id: string;
  kind: PartKind;
  catalogId?: string;
  x: number; // centre, forward
  y: number; // centre, right
  z?: number; // bottom height above the floor
  len: number; // size along x
  wid: number; // size along y
  h?: number; // height
  mass: number; // g (used for custom attachments; catalog parts take the catalog mass)
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
  /** small parts counted but not placed: catalog id → quantity */
  bulk?: Record<string, number>;
  /** the team's own weighing of single parts: catalog id → grams */
  massOverride?: Record<string, number>;
  /** catalog id of the drive wheels (for their mass) */
  wheelId?: string;
}

export interface PartSpec {
  len: number;
  wid: number;
  h: number;
  mass: number;
  resizable?: boolean;
  catalogId?: string;
}

// SPIKE Prime part sizes (1 stud = 8 mm).
export const PART_SPECS: Record<PartKind, PartSpec> = {
  hub: { len: 88, wid: 56, h: 32, mass: 162, catalogId: "hub" },
  motorL: { len: 56, wid: 40, h: 32, mass: 58, catalogId: "motorL" },
  motorM: { len: 48, wid: 32, h: 24, mass: 40, catalogId: "motorM" },
  colorSensor: { len: 24, wid: 24, h: 24, mass: 13, catalogId: "color" },
  distanceSensor: { len: 24, wid: 56, h: 24, mass: 19, catalogId: "distance" },
  forceSensor: { len: 24, wid: 24, h: 24, mass: 17, catalogId: "force" },
  frame: { len: 160, wid: 120, h: 8, mass: 0, resizable: true }, // mass from area
  attachment: { len: 48, wid: 64, h: 24, mass: 60, resizable: true },
  beam: { len: 120, wid: 8, h: 8, mass: 3.08, catalogId: "beam15" },
  openFrame: { len: 88, wid: 56, h: 8, mass: 8, catalogId: "frame711" },
  brick: { len: 64, wid: 8, h: 9.6, mass: 2.6, catalogId: "brick8" },
};

/** Beams + pins of a chassis "estimate" block: about 6 g per 1000 mm² of outline. */
export const FRAME_G_PER_MM2 = 0.006;

export function wheelWidth(d: number) {
  if (d <= 58) return 14;
  if (d <= 70) return 20;
  return 28;
}
export function wheelMass(d: number) {
  return Math.round(12 + ((d - 56) / 32) * 28);
}
export const CASTER_MASS = 8;

export function driveMotorSpec(b: RobotBuild) {
  return PART_SPECS[b.driveMotor === "large" ? "motorL" : "motorM"];
}

export function wheelMassOf(b: RobotBuild) {
  if (b.wheelId && CATALOG_BY_ID[b.wheelId]) return partMass(b.wheelId, b.massOverride);
  return wheelMass(b.wheelDiameterMm);
}

/** Mass of one placed part. */
export function massOfPart(p: Part, b: RobotBuild) {
  if (p.kind === "frame") return Math.round(p.len * p.wid * FRAME_G_PER_MM2);
  if (p.kind === "attachment" || !p.catalogId) return p.mass;
  return partMass(p.catalogId, b.massOverride);
}

export function partHeight(p: Part) {
  return p.h ?? PART_SPECS[p.kind].h;
}
/** Default bottom height: parts sit on the chassis just above the axle. */
export function partZ(p: Part, b: RobotBuild) {
  return p.z ?? Math.max(4, b.wheelDiameterMm / 2 - 4);
}

/** The fixed parts: two wheels and two drive motors, placed by the axle track. */
export function fixedParts(b: RobotBuild) {
  const ww = wheelWidth(b.wheelDiameterMm);
  const ms = driveMotorSpec(b);
  const yWheel = b.axleTrackMm / 2;
  const yMotor = Math.max(ms.wid / 2 + 4, yWheel - ww / 2 - 4 - ms.wid / 2);
  const xMotor = -(ms.len / 2 - 14); // output shaft ~14 mm from the front of the motor
  const r = b.wheelDiameterMm / 2;
  const wm = wheelMassOf(b);
  const mm = b.driveMotor === "large" ? partMass("motorL", b.massOverride) : partMass("motorM", b.massOverride);
  return {
    wheels: [
      { y: -yWheel, len: b.wheelDiameterMm, wid: ww, mass: wm, z: 0, h: b.wheelDiameterMm },
      { y: yWheel, len: b.wheelDiameterMm, wid: ww, mass: wm, z: 0, h: b.wheelDiameterMm },
    ],
    motors: [
      { x: xMotor, y: -yMotor, len: ms.len, wid: ms.wid, mass: mm, z: r - ms.h / 2, h: ms.h },
      { x: xMotor, y: yMotor, len: ms.len, wid: ms.wid, mass: mm, z: r - ms.h / 2, h: ms.h },
    ],
  };
}

export interface BuildStats {
  massG: number;
  computedMassG: number;
  placedMassG: number;
  bulkMassG: number;
  com: { x: number; y: number; z: number };
  inertiaKgM2: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  axleToFrontMm: number;
  wheelLoadShare: number;
  partCount: number;
  warnings: ("tipBack" | "tipFront" | "lightWheels" | "offCenter" | "highCom")[];
}

type M = { x: number; y: number; z: number; len: number; wid: number; h: number; mass: number };

export function buildStats(b: RobotBuild): BuildStats {
  const f = fixedParts(b);
  const casterMass = partMass("caster", b.massOverride) || CASTER_MASS;
  const placed: M[] = [
    ...f.wheels.map((w) => ({ x: 0, ...w })),
    ...f.motors,
    { x: b.casterX, y: 0, z: 0, len: 24, wid: 24, h: 16, mass: casterMass },
    ...b.parts.map((p) => ({ x: p.x, y: p.y, z: partZ(p, b), len: p.len, wid: p.wid, h: partHeight(p), mass: massOfPart(p, b) })),
  ];
  // small counted parts sit spread over the structure: put them at its centroid
  let bulkMass = 0;
  let partCount = b.parts.length + 5;
  for (const [id, n] of Object.entries(b.bulk ?? {})) {
    if (n > 0) {
      bulkMass += n * partMass(id, b.massOverride);
      partCount += n;
    }
  }
  const structure = b.parts.filter((p) => p.kind === "frame" || p.kind === "beam" || p.kind === "openFrame" || p.kind === "brick");
  const sc = structure.length
    ? structure.reduce((a, p) => ({ x: a.x + p.x / structure.length, y: a.y + p.y / structure.length }), { x: 0, y: 0 })
    : { x: 0, y: 0 };
  const masses: M[] = bulkMass > 0 ? [...placed, { x: sc.x, y: sc.y, z: b.wheelDiameterMm / 2, len: 80, wid: 80, h: 16, mass: bulkMass }] : placed;

  const computed = masses.reduce((s, m) => s + m.mass, 0);
  const k = b.measuredMassG && b.measuredMassG > 50 ? b.measuredMassG / computed : 1;
  let mx = 0, my = 0, mz = 0;
  for (const m of masses) {
    mx += m.mass * m.x;
    my += m.mass * m.y;
    mz += m.mass * (m.z + m.h / 2);
  }
  const com = { x: mx / computed, y: my / computed, z: mz / computed };
  // turning inertia about the vertical axis through the axle centre
  let J = 0;
  for (const m of masses) {
    const kg = (m.mass * k) / 1000;
    const x = m.x / 1000;
    const y = m.y / 1000;
    J += kg * (x * x + y * y) + (kg * ((m.len / 1000) ** 2 + (m.wid / 1000) ** 2)) / 12;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = 0;
  for (const m of placed) {
    minX = Math.min(minX, m.x - m.len / 2);
    maxX = Math.max(maxX, m.x + m.len / 2);
    minY = Math.min(minY, m.y - m.wid / 2);
    maxY = Math.max(maxY, m.y + m.wid / 2);
    maxZ = Math.max(maxZ, m.z + m.h);
  }
  // lever rule between axle (x = 0) and caster
  const cx = b.casterX === 0 ? 1 : b.casterX;
  const raw = 1 - com.x / cx;
  const warnings: BuildStats["warnings"] = [];
  if (raw > 1.02) warnings.push(b.casterX > 0 ? "tipBack" : "tipFront");
  else if (raw < -0.02) warnings.push(b.casterX > 0 ? "tipFront" : "tipBack"); // past the caster
  else if (raw < 0.5) warnings.push("lightWheels");
  if (Math.abs(com.y) > 12) warnings.push("offCenter");
  // braking tips the robot when deceleration > g · (horizontal lever / COM height)
  const lever = Math.min(Math.abs(b.casterX - com.x), Math.abs(com.x)) || 1;
  if (com.z > 0 && (9.81 * lever) / com.z < 4) warnings.push("highCom");
  return {
    massG: Math.round(computed * k),
    computedMassG: Math.round(computed),
    placedMassG: Math.round(computed - bulkMass),
    bulkMassG: Math.round(bulkMass * 10) / 10,
    com,
    inertiaKgM2: J,
    lengthMm: Math.round(maxX - minX),
    widthMm: Math.round(maxY - minY),
    heightMm: Math.round(maxZ),
    axleToFrontMm: Math.round(maxX),
    wheelLoadShare: Math.min(1, Math.max(0.4, raw)),
    partCount,
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
  return { id: partId(), kind, catalogId: s.catalogId, x, y, len: s.len, wid: s.wid, h: s.h, mass: s.mass };
}

export function newPartFromCatalog(c: CatalogItem, x = 40, y = 0, z?: number): Part {
  return { id: partId(), kind: c.kind!, catalogId: c.id === "chassis" || c.id === "block" ? undefined : c.id, x, y, z, len: c.len!, wid: c.wid!, h: c.h, mass: c.mass, name: undefined };
}

const P = (id: string, kind: PartKind, x: number, y: number, extra: Partial<Part> = {}): Part => {
  const s = PART_SPECS[kind];
  return { id, kind, catalogId: s.catalogId, x, y, len: s.len, wid: s.wid, h: s.h, mass: s.mass, ...extra };
};

/** A typical FLL robot with 88 mm wheels — the starting point for new teams. */
export function defaultBuild(): RobotBuild {
  return {
    wheelDiameterMm: 88,
    wheelId: "wheel88",
    axleTrackMm: 112,
    driveMotor: "medium",
    caster: "ball",
    casterX: 112,
    parts: [
      P("frameL", "openFrame", 16, -40, { catalogId: "frame1115", len: 120, wid: 88, z: 40 }),
      P("b1", "beam", 16, -76, { catalogId: "beam15", len: 120, z: 32 }),
      P("b2", "beam", 16, 76, { catalogId: "beam15", len: 120, z: 32 }),
      P("b3", "beam", 72, 0, { catalogId: "beam11", len: 8, wid: 88, z: 32 }),
      P("hub1", "hub", -4, 0, { z: 50 }),
      P("mA", "motorM", 84, -44, { z: 24 }),
      P("mE", "motorM", 84, 44, { z: 24 }),
      P("col1", "colorSensor", 104, 0, { z: 8 }),
      { id: "arm1", kind: "attachment", x: 132, y: 0, z: 24, len: 32, wid: 96, h: 24, mass: 70 },
    ],
    bulk: { pinBlack: 40, pinAxle: 12, axle5: 4, axle8: 2, conPerp: 6, bush: 6 },
  };
}

export const TEMPLATES: { id: string; build: () => RobotBuild }[] = [
  { id: "big", build: defaultBuild },
  {
    id: "compact",
    build: () => ({
      wheelDiameterMm: 56,
      wheelId: "wheel56",
      axleTrackMm: 96,
      driveMotor: "medium",
      caster: "ball",
      casterX: 88,
      parts: [
        P("frame1", "openFrame", 40, 0, { catalogId: "frame711", len: 88, wid: 56, z: 20 }),
        P("b1", "beam", 40, -60, { catalogId: "beam15", len: 120, z: 20 }),
        P("b2", "beam", 40, 60, { catalogId: "beam15", len: 120, z: 20 }),
        P("hub1", "hub", 44, 0, { z: 30 }),
        P("mA", "motorM", -24, -32, { z: 28 }),
        P("mE", "motorM", -24, 32, { z: 28 }),
        P("col1", "colorSensor", 116, 0, { z: 6 }),
      ],
      bulk: { pinBlack: 28, pinAxle: 8, axle5: 2, conPerp: 4 },
    }),
  },
  {
    id: "heavy",
    build: () => ({
      wheelDiameterMm: 88,
      wheelId: "wheel88",
      axleTrackMm: 136,
      driveMotor: "large",
      caster: "skid",
      casterX: 128,
      parts: [
        { id: "frame1", kind: "frame", x: 8, y: 0, z: 36, len: 256, wid: 184, h: 8, mass: 0 },
        P("hub1", "hub", -16, 0, { z: 46 }),
        P("mA", "motorL", 92, -48, { z: 30 }),
        P("mE", "motorL", 92, 48, { z: 30 }),
        P("col1", "colorSensor", 116, -16, { z: 8 }),
        P("col2", "colorSensor", 116, 16, { z: 8 }),
        { id: "arm1", kind: "attachment", x: 148, y: 0, z: 30, len: 40, wid: 128, h: 32, mass: 120 },
      ],
      bulk: { pinBlack: 60, pinAxle: 20, axle8: 6, conPerp: 10, gear24: 2 },
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
