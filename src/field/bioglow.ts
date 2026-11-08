// BIOGLOW (FLL Challenge 2026/27, Founders Edition) field.
//
// The competition table is 2362 × 1143 mm (inside the walls). The BIOGLOW
// mat is smaller: FIRST's "Wireframe & Path Diagram" uses a 20 cm grid that
// is 10 squares wide, i.e. ≈ 2000 × 1140 mm. The mat lies against the south
// (bottom, team-side) wall and is centred left–right.
//
// All numbers are table millimetres, origin = top-left inner corner of the
// table as seen from the team side (x → right, y ↓ toward the teams).
// If your measured mat differs, change MAT and everything follows.

export const TABLE_W = 2362;
export const TABLE_H = 1143;
export const WALL = 38; // drawn wall thickness, mm

export const MAT = { w: 2000, h: 1140, x: (2362 - 2000) / 2, y: 1143 - 1140 };

/** Full colour card (public/mats). */
export const MAT_IMAGE = "mats/bioglow.jpg";
/** Line drawing of the mission models (public/mats). */
export const WIREFRAME_IMAGE = "mats/bioglow-wireframe.png";

/** Launch areas: quarter circles in the two bottom corners of the mat. */
export const LAUNCH_RADIUS = 481;
export interface LaunchArea {
  id: "left" | "right";
  cx: number;
  cy: number;
  r: number;
  color: string;
}
export const HOME_AREAS: LaunchArea[] = [
  { id: "left", cx: MAT.x, cy: MAT.y + MAT.h, r: LAUNCH_RADIUS, color: "#e0242c" },
  { id: "right", cx: MAT.x + MAT.w, cy: MAT.y + MAT.h, r: LAUNCH_RADIUS, color: "#1565b3" },
];

export interface MissionDef {
  id: string;
  label: string;
  /** where the red number badges are printed on the mat (some missions have two) */
  spots: { x: number; y: number }[];
}

// Badge centres measured on the mat picture, as fractions of the mat size.
const BADGES: [string, [number, number][]][] = [
  ["01", [[0.4391, 0.9368]]],
  ["02", [[0.3169, 0.523]]],
  ["03", [[0.0429, 0.4072]]],
  ["04", [[0.0733, 0.1273]]],
  ["05", [[0.1974, 0.064]]],
  ["06", [[0.7592, 0.0632]]],
  ["07", [[0.8229, 0.0632]]],
  ["08", [[0.2685, 0.064]]],
  ["09", [[0.3275, 0.064]]],
  ["10", [[0.3902, 0.0985], [0.5466, 0.3235]]],
  ["11", [[0.7034, 0.4737]]],
  ["12", [[0.9649, 0.3309]]],
];

export const BADGE_MM = 92;

export const MISSIONS: MissionDef[] = BADGES.map(([n, spots]) => ({
  id: `M${n}`,
  label: n,
  spots: spots.map(([u, v]) => ({ x: Math.round(MAT.x + u * MAT.w), y: Math.round(MAT.y + v * MAT.h) })),
}));

/** Default start poses: inside the left / right launch areas. */
export const START_LEFT = { x: Math.round(MAT.x + 210), y: Math.round(MAT.y + MAT.h - 180), headingDeg: 0 };
export const START_RIGHT = { x: Math.round(MAT.x + MAT.w - 210), y: Math.round(MAT.y + MAT.h - 180), headingDeg: 180 };
