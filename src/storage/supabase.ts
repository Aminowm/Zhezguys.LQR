// Cloud accounts with Supabase (free tier is enough for a whole season).
// Row Level Security in supabase/schema.sql makes sure a team can only read
// and write its own workspace — the server enforces it, not the browser.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError, Member, RegisterInput, RegisterResult, Session, StorageAdapter, Workspace } from "./types";

export class SupabaseAdapter implements StorageAdapter {
  kind = "cloud" as const;
  private client: Promise<SupabaseClient>;

  constructor(url: string, anonKey: string) {
    this.client = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }),
    );
  }

  private async sessionFor(userId: string): Promise<Session | null> {
    const sb = await this.client;
    const { data: m, error } = await sb.from("members").select("user_id, team_id, first_name, last_name, email").eq("user_id", userId).maybeSingle();
    if (error) throw new AuthError("network", error.message);
    if (!m) return null;
    const { data: t, error: e2 } = await sb.from("teams").select("id, name, join_code").eq("id", m.team_id).single();
    if (e2 || !t) throw new AuthError("no_team", e2?.message);
    return {
      user: { id: m.user_id, email: m.email, firstName: m.first_name, lastName: m.last_name },
      team: { id: t.id, name: t.name, joinCode: t.join_code },
    };
  }

  /** After e-mail confirmation the team is created/joined from the saved sign-up data. */
  private async ensureTeam(): Promise<Session> {
    const sb = await this.client;
    const { data } = await sb.auth.getUser();
    const u = data.user;
    if (!u) throw new AuthError("bad_login");
    const existing = await this.sessionFor(u.id);
    if (existing) return existing;
    const md = (u.user_metadata ?? {}) as Record<string, string>;
    if (!md.team_mode) throw new AuthError("no_team");
    return this.finishTeam(md.team_mode as "create" | "join", md.team_value ?? "");
  }

  async getSession() {
    const sb = await this.client;
    const { data } = await sb.auth.getSession();
    if (!data.session) return null;
    try {
      return await this.ensureTeam();
    } catch {
      return null;
    }
  }

  async lookupTeam(joinCode: string) {
    const sb = await this.client;
    const { data, error } = await sb.rpc("lookup_team", { code: joinCode.trim().toUpperCase() });
    if (error) return null;
    return (data as string | null) ?? null;
  }

  async finishTeam(mode: "create" | "join", value: string): Promise<Session> {
    const sb = await this.client;
    const { data: ud } = await sb.auth.getUser();
    const md = (ud.user?.user_metadata ?? {}) as Record<string, string>;
    const args = { first_name: md.first_name ?? "", last_name: md.last_name ?? "" };
    const { error } =
      mode === "create"
        ? await sb.rpc("create_team", { team_name: value, ...args })
        : await sb.rpc("join_team", { code: value.trim().toUpperCase(), ...args });
    if (error) {
      if (error.message.includes("bad_code")) throw new AuthError("bad_code");
      throw new AuthError("network", error.message);
    }
    const s = await this.sessionFor(ud.user!.id);
    if (!s) throw new AuthError("no_team");
    return s;
  }

  async register(input: RegisterInput): Promise<RegisterResult> {
    const sb = await this.client;
    if (input.mode === "join" && !(await this.lookupTeam(input.joinCode ?? ""))) throw new AuthError("bad_code");
    const { data, error } = await sb.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: window.location.href.split("#")[0],
        data: {
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          team_mode: input.mode,
          team_value: input.mode === "create" ? (input.teamName ?? "").trim() : (input.joinCode ?? "").trim().toUpperCase(),
        },
      },
    });
    if (error) {
      if (/registered/i.test(error.message)) throw new AuthError("email_taken");
      if (/password/i.test(error.message)) throw new AuthError("weak_password", error.message);
      throw new AuthError("network", error.message);
    }
    if (!data.session) return { needsConfirm: true };
    return { session: await this.ensureTeam() };
  }

  async login(email: string, password: string) {
    const sb = await this.client;
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (/confirm/i.test(error.message)) throw new AuthError("not_confirmed");
      throw new AuthError("bad_login", error.message);
    }
    return this.ensureTeam();
  }

  async logout() {
    const sb = await this.client;
    await sb.auth.signOut();
  }

  async loadWorkspace(teamId: string) {
    const sb = await this.client;
    const { data, error } = await sb.from("workspaces").select("data").eq("team_id", teamId).maybeSingle();
    if (error) throw new AuthError("network", error.message);
    return (data?.data as Workspace | undefined) ?? null;
  }

  async saveWorkspace(teamId: string, ws: Workspace) {
    const sb = await this.client;
    const { data: ud } = await sb.auth.getUser();
    const { error } = await sb
      .from("workspaces")
      .upsert({ team_id: teamId, data: ws, updated_at: new Date().toISOString(), updated_by: ud.user?.id }, { onConflict: "team_id" });
    if (error) throw new AuthError("network", error.message);
  }

  async members(teamId: string): Promise<Member[]> {
    const sb = await this.client;
    const { data, error } = await sb.from("members").select("user_id, first_name, last_name, email").eq("team_id", teamId);
    if (error) throw new AuthError("network", error.message);
    return (data ?? []).map((m) => ({ id: m.user_id, firstName: m.first_name, lastName: m.last_name, email: m.email }));
  }
}
