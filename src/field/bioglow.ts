// BIOGLOW (FLL Challenge 2026/27) table layout.
//
// PLACEHOLDER: the official mission positions and mat art are not in this
// repository yet. Positions below are an evenly spread, editable layout so
// teams can already plan. When the official mat image and rulebook arrive,
// replace MAT_IMAGE and the x/y/w/h numbers here (all in table millimetres,
// origin = top-left corner of the mat as seen from the team's side).

export const TABLE_W = 2362;
export const TABLE_H = 1143;
export const WALL = 38; // drawn wall thickness, mm

/** Put the official mat picture at public/mats/bioglow.png (2362×1143 aspect). */
export const MAT_IMAGE = "mats/bioglow.png";

export interface MissionDef {
  id: string;
  label: string;
  x: number; // centre, mm
  y: number;
  w: number;
  h: number;
  hue: number; // placeholder colour (full-card mode)
}

const hues = [168, 190, 140, 280, 205, 95, 320, 175, 250, 120, 300, 155, 230, 75, 340];

const spots: [number, number][] = [
  [720, 210], [1090, 160], [1460, 210], [1830, 190],
  [640, 560], [1000, 470], [1360, 520], [1720, 470], [2060, 560],
  [760, 900], [1130, 960], [1500, 880], [1870, 930],
  [1180, 700], [450, 330],
];

export const MISSIONS: MissionDef[] = spots.map(([x, y], i) => ({
  id: `M${String(i + 1).padStart(2, "0")}`,
  label: `M${String(i + 1).padStart(2, "0")}`,
  x,
  y,
  w: i === 13 ? 220 : 180,
  h: i === 13 ? 220 : 150,
  hue: hues[i % hues.length],
}));

export interface Zone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Launch / home areas (placeholder: both lower corners, like recent seasons). */
export const HOME_AREAS: Zone[] = [
  { id: "left", x: 0, y: 700, w: 400, h: 443 },
  { id: "right", x: TABLE_W - 400, y: 700, w: 400, h: 443 },
];
