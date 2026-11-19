// LEGO colours for parts in the 3D configurator (kept out of the three.js bundle).
import { Part, partHeight } from "./build";

/** Official-ish LEGO colours teams can paint parts with. */
export const LEGO_COLORS = [
  { id: "white", hex: "#F4F4F4", en: "White", ru: "Белый" },
  { id: "lbg", hex: "#A0A5A9", en: "Light bluish gray", ru: "Светло-серый" },
  { id: "dbg", hex: "#6C6E68", en: "Dark bluish gray", ru: "Тёмно-серый" },
  { id: "black", hex: "#212121", en: "Black", ru: "Чёрный" },
  { id: "azure", hex: "#36AEBF", en: "Medium azure", ru: "Бирюзовый" },
  { id: "dazure", hex: "#078BC9", en: "Dark azure", ru: "Голубой" },
  { id: "blue", hex: "#0055BF", en: "Blue", ru: "Синий" },
  { id: "yellow", hex: "#F2CD37", en: "Yellow", ru: "Жёлтый" },
  { id: "red", hex: "#C91A09", en: "Red", ru: "Красный" },
  { id: "magenta", hex: "#923978", en: "Magenta", ru: "Маджента" },
  { id: "green", hex: "#4B9F4A", en: "Green", ru: "Зелёный" },
  { id: "orange", hex: "#FE8A18", en: "Orange", ru: "Оранжевый" },
] as const;

/** Default colour of each kind of part (teams can repaint beams, frames and attachments). */
export const DEFAULT_PART_COLOR: Record<string, string> = {
  beam: "#A0A5A9",
  thin: "#078BC9",
  openFrame: "#F4F4F4",
  brick: "#F2CD37",
  frame: "#36AEBF",
  attachment: "#F2CD37",
};
export const partColor = (p: Part) =>
  p.color ?? (p.kind === "beam" && partHeight(p) <= 4.5 ? DEFAULT_PART_COLOR.thin : DEFAULT_PART_COLOR[p.kind] ?? "#A0A5A9");

