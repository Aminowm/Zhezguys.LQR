// Browser-only accounts. Everything lives in this browser's localStorage.
// Passwords are stored as salted PBKDF2 hashes, and a team's workspace is
// only loaded for a signed-in member of that team.

import { AuthError, Member, RegisterInput, RegisterResult, Session, StorageAdapter, Team, User, Workspace } from "./types";

interface StoredUser extends User {
  salt: string;
  hash: string;
  teamId: string;
}
interface StoredTeam extends Team {
  members: string[];
}

const K = {
  users: "zg.users.v1",
  teams: "zg.teams.v1",
  session: "zg.session.v1",
  ws: (id: string) => `zg.ws.v1.${id}`,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new AuthError("storage_full", String(e));
  }
}

const uid = () =>
  (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function makeJoinCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

async function hashPassword(password: string, salt: string) {
  const enc = new TextEncoder();
  if (crypto.subtle) {
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 120_000, hash: "SHA-256" }, key, 256);
    return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // very old browsers / insecure origin: weak fallback, still salted
  let h = 0;
  for (const c of salt + password) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return "w" + (h >>> 0).toString(16);
}

const norm = (e: string) => e.trim().toLowerCase();

export class LocalAdapter implements StorageAdapter {
  kind = "local" as const;

  private users() {
    return read<Record<string, StoredUser>>(K.users, {});
  }
  private teams() {
    return read<Record<string, StoredTeam>>(K.teams, {});
  }
  private toSession(u: StoredUser): Session {
    const t = this.teams()[u.teamId];
    if (!t) throw new AuthError("no_team");
    return {
      user: { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName },
      team: { id: t.id, name: t.name, joinCode: t.joinCode },
    };
  }

  async getSession() {
    const s = read<{ userId: string } | null>(K.session, null);
    if (!s) return null;
    const u = Object.values(this.users()).find((x) => x.id === s.userId);
    if (!u) return null;
    try {
      return this.toSession(u);
    } catch {
      return null;
    }
  }

  async lookupTeam(joinCode: string) {
    const code = joinCode.trim().toUpperCase();
    const t = Object.values(this.teams()).find((x) => x.joinCode === code);
    return t ? t.name : null;
  }

  async register(input: RegisterInput): Promise<RegisterResult> {
    const users = this.users();
    const teams = this.teams();
    const email = norm(input.email);
    if (users[email]) throw new AuthError("email_taken");
    let team: StoredTeam;
    if (input.mode === "join") {
      const code = (input.joinCode ?? "").trim().toUpperCase();
      const found = Object.values(teams).find((x) => x.joinCode === code);
      if (!found) throw new AuthError("bad_code");
      team = found;
    } else {
      const name = (input.teamName ?? "").trim();
      if (!name) throw new AuthError("team_required");
      let code = makeJoinCode();
      while (Object.values(teams).some((x) => x.joinCode === code)) code = makeJoinCode();
      team = { id: uid(), name, joinCode: code, members: [] };
    }
    const salt = uid();
    const user: StoredUser = {
      id: uid(),
      email,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      salt,
      hash: await hashPassword(input.password, salt),
      teamId: team.id,
    };
    team.members = [...team.members, user.id];
    teams[team.id] = team;
    users[email] = user;
    write(K.teams, teams);
    write(K.users, users);
    write(K.session, { userId: user.id });
    return { session: this.toSession(user) };
  }

  async login(email: string, password: string) {
    const u = this.users()[norm(email)];
    if (!u) throw new AuthError("bad_login");
    const h = await hashPassword(password, u.salt);
    if (h !== u.hash) throw new AuthError("bad_login");
    write(K.session, { userId: u.id });
    return this.toSession(u);
  }

  async logout() {
    localStorage.removeItem(K.session);
  }

  private async requireMember(teamId: string) {
    const s = await this.getSession();
    if (!s || s.team.id !== teamId) throw new AuthError("forbidden");
    return s;
  }

  async loadWorkspace(teamId: string) {
    await this.requireMember(teamId);
    return read<Workspace | null>(K.ws(teamId), null);
  }

  async saveWorkspace(teamId: string, ws: Workspace) {
    const s = await this.requireMember(teamId);
    write(K.ws(teamId), { ...ws, updatedBy: s.user.id });
  }

  async members(teamId: string): Promise<Member[]> {
    await this.requireMember(teamId);
    const t = this.teams()[teamId];
    const all = Object.values(this.users());
    return (t?.members ?? [])
      .map((id) => all.find((u) => u.id === id))
      .filter((u): u is StoredUser => !!u)
      .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }));
  }
}
