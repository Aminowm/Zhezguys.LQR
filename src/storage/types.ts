import type { RobotProfile } from "../sim/robot";
import type { Pose } from "../sim/physics";
import type { CodeFileId } from "../code/defaults";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface Team {
  id: string;
  name: string;
  joinCode: string;
}

export interface Session {
  user: User;
  team: Team;
}

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export type CardMode = "blank" | "full" | "missions";

export type PlanTool = "select" | "pen" | "arrow" | "path" | "text" | "robot" | "zone" | "eraser";

export interface PlanItem {
  id: string;
  kind: "pen" | "arrow" | "path" | "text" | "robot" | "zone";
  programId: string | null;
  color: string;
  width: number;
  points: [number, number][];
  text?: string;
  heading?: number;
}

export interface Program {
  id: string;
  name: string;
  color: string;
  code: string;
  start: Pose;
  visible: boolean;
  missions: string[];
  notes: string;
}

export interface Plan {
  cardMode: CardMode;
  showGrid: boolean;
  /** red mission numbers on the Missions card (off = exactly FIRST's wireframe) */
  showMissionNumbers?: boolean;
  items: PlanItem[];
  missionOverrides: Record<string, { x: number; y: number }>;
}

export interface TuneSummary {
  at: string;
  robotKey: string;
  lqr: { Q: number; R: number; b: number; kd: number; Minpower: number };
  pid: { Kp: number; Ki: number; Kd: number; Minpower: number };
  db: { turn_rate: number; turn_acceleration: number };
  straight: { Q: number; R: number; b: number; kd: number };
}

export interface Workspace {
  version: 1;
  robot: RobotProfile;
  files: Record<CodeFileId, string>;
  programs: Program[];
  plan: Plan;
  tune?: TuneSummary;
  updatedAt: string;
  updatedBy?: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  mode: "create" | "join";
  teamName?: string;
  joinCode?: string;
}

export interface RegisterResult {
  session?: Session;
  /** Supabase: the user must click the link in the e-mail first */
  needsConfirm?: boolean;
}

export interface StorageAdapter {
  kind: "local" | "cloud";
  getSession(): Promise<Session | null>;
  register(input: RegisterInput): Promise<RegisterResult>;
  login(email: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  /** Supabase: finish creating/joining a team after e-mail confirmation */
  finishTeam?(mode: "create" | "join", value: string): Promise<Session>;
  loadWorkspace(teamId: string): Promise<Workspace | null>;
  saveWorkspace(teamId: string, ws: Workspace): Promise<void>;
  members(teamId: string): Promise<Member[]>;
  lookupTeam(joinCode: string): Promise<string | null>;
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}
