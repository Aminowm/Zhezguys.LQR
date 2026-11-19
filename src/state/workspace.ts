import { DEFAULT_FILES, DEFAULT_PROGRAM, emptyProgram, FILE_ORDER, MAX_PROGRAMS } from "../code/defaults";
import { LEGACY_FILES, LEGACY_PROGRAM, LEGACY_PROGRAM_V0 } from "../code/legacy";
import { applyModel } from "../code/params";
import { DEFAULT_PROFILE, RobotProfile } from "../sim/robot";
import type { Program, Workspace } from "../storage/types";
import { START_LEFT, START_RIGHT } from "../field/bioglow";
import { applyBuild, defaultBuild } from "../robot/build";

export const PROGRAM_COLORS = ["#2f6db5", "#d97706", "#be185d", "#0f8a7a", "#6d4fc2", "#5f7f1f", "#c2410c", "#0e7490", "#475569"];
export const DRAW_COLORS = ["#16233b", "#2f6db5", "#d97706", "#be185d", "#0f8a7a", "#6d4fc2", "#c2410c", "#ffffff"];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newProgram(index: number, name?: string): Program {
  const leftSide = index % 2 === 0;
  return {
    id: uid(),
    name: name ?? `Program ${index + 1}`,
    color: PROGRAM_COLORS[index % PROGRAM_COLORS.length],
    code: index === 0 ? DEFAULT_PROGRAM : emptyProgram(index + 1),
    start: leftSide ? { ...START_LEFT } : { ...START_RIGHT },
    visible: true,
    missions: [],
    notes: "",
  };
}

export const canAddProgram = (ws: Workspace) => ws.programs.length < MAX_PROGRAMS;

export function defaultRobot(): RobotProfile {
  return applyBuild({ ...DEFAULT_PROFILE, name: "My robot" }, { ...defaultBuild(), measuredMassG: DEFAULT_PROFILE.massG });
}

export function defaultWorkspace(robot: RobotProfile = defaultRobot()): Workspace {
  return {
    version: 1,
    robot,
    files: { ...DEFAULT_FILES, config: applyModel(DEFAULT_FILES.config, robot) },
    programs: [newProgram(0), newProgram(1)],
    plan: { cardMode: "full", showGrid: false, items: [], missionOverrides: {} },
    updatedAt: new Date().toISOString(),
  };
}

/** Fill in anything missing from older saves; upgrade untouched old starter code. */
export function upgradeWorkspace(ws: Partial<Workspace> | null | undefined): Workspace {
  if (!ws || ws.version !== 1) return defaultWorkspace();
  const d = defaultWorkspace(ws.robot ? { ...DEFAULT_PROFILE, ...ws.robot } : undefined);
  const files = { ...d.files, ...(ws.files ?? {}) };
  // Files the team never changed are replaced by the new library.
  const untouched = FILE_ORDER.every((id) => !ws.files?.[id] || ws.files[id] === LEGACY_FILES[id]);
  if (untouched) for (const id of FILE_ORDER) files[id] = d.files[id];
  const programs = (ws.programs && ws.programs.length ? ws.programs : d.programs).slice(0, MAX_PROGRAMS).map((p, i) => {
    const merged = { ...newProgram(i), ...p };
    if (untouched && (p.code === LEGACY_PROGRAM || p.code === LEGACY_PROGRAM_V0 || /^# Program \d+\nGyro_reset\(0\)\n$/.test(p.code ?? "")))
      merged.code = i === 0 ? DEFAULT_PROGRAM : emptyProgram(i + 1);
    return merged;
  });
  return {
    ...d,
    ...ws,
    robot: { ...DEFAULT_PROFILE, ...(ws.robot ?? {}) },
    files,
    programs,
    plan: { ...d.plan, ...(ws.plan ?? {}) },
  } as Workspace;
}
