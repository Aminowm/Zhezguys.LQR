// LEGO parts used on FLL SPIKE Prime robots, with design numbers and masses.
//
// Masses are typical values for one part (grams, ≈ ±10 %). Teams can weigh a
// part and correct it in the parts list — the whole robot updates.
// "kind" = the part can be placed in the 3D builder; without it the part is
// counted in the parts list only (pins, axles, gears… are too small to place).

import type { PartKind } from "./build";

export type Cat = "spike" | "beams" | "thin" | "frames" | "bricks" | "pins" | "axles" | "connectors" | "gears" | "wheels" | "other";

export interface CatalogItem {
  id: string;
  num: string; // LEGO design number ("" when it is a set/assembly)
  cat: Cat;
  en: string;
  ru: string;
  mass: number; // g, one piece
  kind?: PartKind;
  len?: number; // mm along the robot (x)
  wid?: number; // mm across (y)
  h?: number; // mm high (z)
  wheelD?: number; // drive wheel diameter (wheels category)
}

const beam = (n: number, num: string, mass: number): CatalogItem => ({
  id: `beam${n}`, num, cat: "beams", en: `Technic Liftarm 1×${n} Thick`, ru: `Балка 1×${n} толстая`, mass, kind: "beam", len: 8 * n, wid: 8, h: 8,
});
const thin = (n: number, num: string, mass: number): CatalogItem => ({
  id: `thin${n}`, num, cat: "thin", en: `Technic Liftarm 1×${n} Thin`, ru: `Балка 1×${n} тонкая`, mass, kind: "beam", len: 8 * n, wid: 8, h: 4,
});
const axle = (n: number, num: string, mass: number): CatalogItem => ({
  id: `axle${n}`, num, cat: "axles", en: `Technic Axle ${n}`, ru: `Ось ${n}`, mass,
});

export const CATALOG: CatalogItem[] = [
  // SPIKE Prime electronics
  { id: "hub", num: "45601", cat: "spike", en: "SPIKE Prime Large Hub (with battery)", ru: "Хаб SPIKE Prime (с батареей)", mass: 162, kind: "hub", len: 88, wid: 56, h: 32 },
  { id: "motorL", num: "45602", cat: "spike", en: "Large Angular Motor", ru: "Большой мотор", mass: 58, kind: "motorL", len: 56, wid: 40, h: 32 },
  { id: "motorM", num: "45603", cat: "spike", en: "Medium Angular Motor", ru: "Средний мотор", mass: 40, kind: "motorM", len: 48, wid: 32, h: 24 },
  { id: "color", num: "45605", cat: "spike", en: "Color Sensor", ru: "Датчик цвета", mass: 13, kind: "colorSensor", len: 24, wid: 24, h: 24 },
  { id: "distance", num: "45604", cat: "spike", en: "Distance Sensor", ru: "Датчик расстояния", mass: 19, kind: "distanceSensor", len: 24, wid: 56, h: 24 },
  { id: "force", num: "45606", cat: "spike", en: "Force Sensor", ru: "Датчик силы", mass: 17, kind: "forceSensor", len: 24, wid: 24, h: 24 },

  // thick liftarms
  { id: "beam1", num: "18654", cat: "beams", en: "Technic Liftarm 1×1 Thick", ru: "Балка 1×1 толстая", mass: 0.2, kind: "beam", len: 8, wid: 8, h: 8 },
  { id: "beam2", num: "43857", cat: "beams", en: "Technic Liftarm 1×2 Thick", ru: "Балка 1×2 толстая", mass: 0.4, kind: "beam", len: 16, wid: 8, h: 8 },
  beam(3, "32523", 0.66),
  beam(5, "32316", 1.07),
  beam(7, "32524", 1.47),
  beam(9, "40490", 1.87),
  beam(11, "32525", 2.28),
  beam(13, "41239", 2.68),
  beam(15, "32278", 3.08),
  { id: "bentL24", num: "32140", cat: "beams", en: "Technic Liftarm 2×4 L-Shape Thick", ru: "Балка Г-образная 2×4", mass: 0.87, kind: "beam", len: 32, wid: 16, h: 8 },
  { id: "bentL35", num: "32526", cat: "beams", en: "Technic Liftarm 3×5 L-Shape Thick", ru: "Балка Г-образная 3×5", mass: 1.33, kind: "beam", len: 40, wid: 24, h: 8 },
  { id: "bent7", num: "32348", cat: "beams", en: "Technic Liftarm 1×7 Bent (4-4)", ru: "Балка 1×7 изогнутая (4-4)", mass: 1.47, kind: "beam", len: 48, wid: 24, h: 8 },
  { id: "bent9a", num: "6629", cat: "beams", en: "Technic Liftarm 1×9 Bent (6-4)", ru: "Балка 1×9 изогнутая (6-4)", mass: 1.85, kind: "beam", len: 56, wid: 24, h: 8 },
  { id: "bent9b", num: "32271", cat: "beams", en: "Technic Liftarm 1×9 Bent (7-3)", ru: "Балка 1×9 изогнутая (7-3)", mass: 1.85, kind: "beam", len: 56, wid: 24, h: 8 },

  // thin liftarms
  { id: "thin2", num: "41677", cat: "thin", en: "Technic Liftarm 1×2 Thin", ru: "Балка 1×2 тонкая", mass: 0.2, kind: "beam", len: 16, wid: 8, h: 4 },
  thin(3, "6632", 0.28),
  thin(4, "32449", 0.36),
  thin(6, "32063", 0.52),

  // frames
  { id: "frame57", num: "64179", cat: "frames", en: "Technic Frame 5×7 Open Center", ru: "Рама 5×7", mass: 4.4, kind: "openFrame", len: 56, wid: 40, h: 8 },
  { id: "frame511", num: "64178", cat: "frames", en: "Technic Frame 5×11 Open Center", ru: "Рама 5×11", mass: 6.4, kind: "openFrame", len: 88, wid: 40, h: 8 },
  { id: "frame711", num: "39794", cat: "frames", en: "Technic Frame 7×11 Open Center", ru: "Рама 7×11", mass: 8.0, kind: "openFrame", len: 88, wid: 56, h: 8 },
  { id: "frame1115", num: "39790", cat: "frames", en: "Technic Frame 11×15 Open Center", ru: "Рама 11×15", mass: 14.2, kind: "openFrame", len: 120, wid: 88, h: 8 },

  // bricks
  { id: "brick2", num: "3700", cat: "bricks", en: "Technic Brick 1×2 with Hole", ru: "Кубик Technic 1×2 с отверстием", mass: 0.75, kind: "brick", len: 16, wid: 8, h: 9.6 },
  { id: "brick6", num: "3894", cat: "bricks", en: "Technic Brick 1×6 with Holes", ru: "Кубик Technic 1×6 с отверстиями", mass: 2.0, kind: "brick", len: 48, wid: 8, h: 9.6 },
  { id: "brick8", num: "3702", cat: "bricks", en: "Technic Brick 1×8 with Holes", ru: "Кубик Technic 1×8 с отверстиями", mass: 2.6, kind: "brick", len: 64, wid: 8, h: 9.6 },
  { id: "brick16", num: "3703", cat: "bricks", en: "Technic Brick 1×16 with Holes", ru: "Кубик Technic 1×16 с отверстиями", mass: 5.1, kind: "brick", len: 128, wid: 8, h: 9.6 },

  // pins
  { id: "pinBlack", num: "2780", cat: "pins", en: "Technic Pin with Friction (black)", ru: "Штифт с трением (чёрный)", mass: 0.17 },
  { id: "pinGray", num: "3673", cat: "pins", en: "Technic Pin without Friction (grey)", ru: "Штифт без трения (серый)", mass: 0.16 },
  { id: "pinAxle", num: "43093", cat: "pins", en: "Technic Axle Pin with Friction (blue)", ru: "Штифт-ось с трением (синий)", mass: 0.24 },
  { id: "pinAxleTan", num: "3749", cat: "pins", en: "Technic Axle Pin without Friction (tan)", ru: "Штифт-ось без трения (бежевый)", mass: 0.13 },
  { id: "pin3", num: "6558", cat: "pins", en: "Technic Pin 3L with Friction (blue)", ru: "Штифт 3L с трением (синий)", mass: 0.27 },
  { id: "pin3stop", num: "32054", cat: "pins", en: "Technic Pin 3L with Stop Bush", ru: "Штифт 3L с упором", mass: 0.33 },
  { id: "pinAxle3", num: "11214", cat: "pins", en: "Technic Axle Pin 3L with Friction", ru: "Штифт-ось 3L с трением", mass: 0.3 },

  // axles
  axle(2, "32062", 0.13),
  axle(3, "4519", 0.2),
  axle(4, "3705", 0.27),
  axle(5, "32073", 0.34),
  axle(6, "3706", 0.41),
  axle(7, "44294", 0.48),
  axle(8, "3707", 0.55),
  axle(9, "60485", 0.62),
  axle(10, "3737", 0.69),
  axle(12, "3708", 0.83),
  { id: "axle4stop", num: "87083", cat: "axles", en: "Technic Axle 4 with Stop", ru: "Ось 4 с упором", mass: 0.32 },
  { id: "bush", num: "3713", cat: "axles", en: "Technic Bush", ru: "Втулка", mass: 0.14 },
  { id: "bushHalf", num: "4265c", cat: "axles", en: "Technic Bush 1/2 Smooth", ru: "Полувтулка", mass: 0.07 },

  // connectors
  { id: "conPerp", num: "6536", cat: "connectors", en: "Axle and Pin Connector Perpendicular", ru: "Соединитель ось-штифт перпендикулярный", mass: 0.3 },
  { id: "conPerp3", num: "32184", cat: "connectors", en: "Axle and Pin Connector Perpendicular 3L", ru: "Соединитель перпендикулярный 3L", mass: 0.52 },
  { id: "conAxleHole", num: "32039", cat: "connectors", en: "Axle and Pin Connector with Axle Hole", ru: "Соединитель с отверстием для оси", mass: 0.3 },
  { id: "angle1", num: "32013", cat: "connectors", en: "Axle and Pin Connector Angled #1", ru: "Угловой соединитель №1", mass: 0.28 },
  { id: "angle2", num: "32034", cat: "connectors", en: "Axle and Pin Connector Angled #2 (180°)", ru: "Угловой соединитель №2 (180°)", mass: 0.38 },
  { id: "axleCon", num: "59443", cat: "connectors", en: "Axle Connector 2L Smooth", ru: "Соединитель осей 2L", mass: 0.22 },
  { id: "conDouble", num: "41678", cat: "connectors", en: "Axle and Pin Connector Perpendicular Double Split", ru: "Двойной перпендикулярный соединитель", mass: 0.55 },
  { id: "con4pins", num: "48989", cat: "connectors", en: "Axle and Pin Connector Perpendicular with 4 Pins", ru: "Соединитель с 4 штифтами", mass: 0.88 },
  { id: "con3x3", num: "55615", cat: "connectors", en: "Pin Connector Perpendicular Bent 3×3", ru: "Изогнутый соединитель 3×3", mass: 0.95 },
  { id: "conPerpDouble", num: "32291", cat: "connectors", en: "Axle and Pin Connector Perpendicular Double", ru: "Двойной соединитель ось-штифт", mass: 0.62 },

  // gears
  { id: "gear8", num: "3647", cat: "gears", en: "Technic Gear 8 Tooth", ru: "Шестерня 8 зубьев", mass: 0.24 },
  { id: "gear12b", num: "32270", cat: "gears", en: "Technic Gear 12 Tooth Double Bevel", ru: "Шестерня 12 зубьев коническая двойная", mass: 0.48 },
  { id: "gear12bevel", num: "6589", cat: "gears", en: "Technic Gear 12 Tooth Bevel", ru: "Шестерня 12 зубьев коническая", mass: 0.3 },
  { id: "gear16", num: "94925", cat: "gears", en: "Technic Gear 16 Tooth", ru: "Шестерня 16 зубьев", mass: 0.62 },
  { id: "gear20b", num: "32269", cat: "gears", en: "Technic Gear 20 Tooth Double Bevel", ru: "Шестерня 20 зубьев коническая двойная", mass: 1.05 },
  { id: "gear24", num: "3648", cat: "gears", en: "Technic Gear 24 Tooth", ru: "Шестерня 24 зуба", mass: 0.95 },
  { id: "gear36b", num: "32498", cat: "gears", en: "Technic Gear 36 Tooth Double Bevel", ru: "Шестерня 36 зубьев коническая двойная", mass: 2.4 },
  { id: "gear40", num: "3649", cat: "gears", en: "Technic Gear 40 Tooth", ru: "Шестерня 40 зубьев", mass: 2.85 },
  { id: "worm", num: "4716", cat: "gears", en: "Technic Gear Worm Screw", ru: "Червячная передача", mass: 0.75 },
  { id: "knob", num: "32072", cat: "gears", en: "Technic Knob Wheel", ru: "Крестовая шестерня", mass: 0.45 },

  // drive wheels (rim + tyre)
  { id: "wheel56", num: "", cat: "wheels", en: "Wheel 56 mm with tyre (SPIKE Prime set)", ru: "Колесо 56 мм с шиной (набор SPIKE Prime)", mass: 15, wheelD: 56 },
  { id: "wheel62", num: "", cat: "wheels", en: "Wheel 62.4 × 20 with tyre", ru: "Колесо 62,4 × 20 с шиной", mass: 23, wheelD: 62.4 },
  { id: "wheel88", num: "", cat: "wheels", en: "Wheel 88 mm with tyre (SPIKE Prime expansion)", ru: "Колесо 88 мм с шиной (расширение SPIKE Prime)", mass: 40, wheelD: 88 },

  // other
  { id: "caster", num: "", cat: "other", en: "Ball caster (housing + ball)", ru: "Шаровая опора (корпус + шар)", mass: 8 },
  { id: "chassis", num: "", cat: "other", en: "Chassis estimate (beams + pins by area)", ru: "Шасси — оценка по площади (балки + штифты)", mass: 0, kind: "frame", len: 160, wid: 120, h: 8 },
  { id: "block", num: "", cat: "other", en: "Custom attachment (set its mass)", ru: "Своя насадка (укажите массу)", mass: 60, kind: "attachment", len: 48, wid: 64, h: 24 },
];

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export const CATS: Cat[] = ["spike", "beams", "thin", "frames", "bricks", "pins", "axles", "connectors", "gears", "wheels", "other"];

/** Mass of a catalog part, using the team's own weighing if they entered one. */
export function partMass(id: string, overrides?: Record<string, number>) {
  return overrides?.[id] ?? CATALOG_BY_ID[id]?.mass ?? 0;
}

export function searchCatalog(q: string, cat: Cat | "all") {
  const s = q.trim().toLowerCase();
  return CATALOG.filter(
    (c) => (cat === "all" || c.cat === cat) && (!s || c.en.toLowerCase().includes(s) || c.ru.toLowerCase().includes(s) || c.num.includes(s) || c.id.toLowerCase().includes(s)),
  );
}
