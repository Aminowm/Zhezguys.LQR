import { DEFAULT_FILES, DEFAULT_PROGRAM } from "../code/defaults";
import { DEFAULT_PROFILE } from "../sim/robot";
import type { Program, Workspace } from "../storage/types";

export const PROGRAM_COLORS = ["#0d9488", "#d97706", "#7c3aed", "#db2777", "#2563eb", "#65a30d", "#dc2626", "#0891b2"];
export const DRAW_COLORS = ["#1b2420", "#0d9488", "#d97706", "#7c3aed", "#db2777", "#2563eb", "#dc2626", "#ffffff"];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newProgram(index: number, name?: string): Program {
  const leftSide = index % 2 === 0;
  return {
    id: uid(),
    name: name ?? `Program ${index + 1}`,
    color: PROGRAM_COLORS[index % PROGRAM_COLORS.length],
    code: index === 0 ? DEFAULT_PROGRAM : `# ${name ?? `Program ${index + 1}`}\nGyro_reset(0)\n`,
    start: leftSide ? { x: 200, y: 950, headingDeg: 0 } : { x: 2162, y: 950, headingDeg: 180 },
    visible: true,
    missions: [],
    notes: "",
  };
}

export function defaultWorkspace(): Workspace {
  return {
    version: 1,
    robot: { ...DEFAULT_PROFILE, name: "My robot" },
    files: { ...DEFAULT_FILES },
    programs: [newProgram(0), newProgram(1)],
    plan: { cardMode: "full", showGrid: false, items: [], missionOverrides: {} },
    updatedAt: new Date().toISOString(),
  };
}

/** Fill in anything missing from older saves. */
export function upgradeWorkspace(ws: Partial<Workspace> | null | undefined): Workspace {
  const d = defaultWorkspace();
  if (!ws || ws.version !== 1) return d;
  return {
    ...d,
    ...ws,
    robot: { ...DEFAULT_PROFILE, ...(ws.robot ?? {}) },
    files: { ...DEFAULT_FILES, ...(ws.files ?? {}) },
    programs: ws.programs && ws.programs.length ? ws.programs.map((p) => ({ ...newProgram(0), ...p })) : d.programs,
    plan: { ...d.plan, ...(ws.plan ?? {}) },
  } as Workspace;
}
