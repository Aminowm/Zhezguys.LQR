import { create } from "zustand";
import { storage, AuthError, RegisterInput, Session, Workspace } from "../storage";
import { defaultWorkspace, upgradeWorkspace } from "./workspace";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Theme = "light" | "dark" | "system";

interface AppState {
  ready: boolean;
  session: Session | null;
  ws: Workspace | null;
  save: SaveStatus;
  theme: Theme;
  toast: string | null;
  init(): Promise<void>;
  register(input: RegisterInput): Promise<{ needsConfirm?: boolean }>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  update(fn: (ws: Workspace) => Workspace): void;
  replaceWorkspace(ws: Workspace): void;
  setTheme(t: Theme): void;
  notify(msg: string): void;
}

let saveTimer: number | undefined;
let toastTimer: number | undefined;

function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
}

function savedTheme(): Theme {
  try {
    const t = localStorage.getItem("zg.theme") as Theme | null;
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  session: null,
  ws: null,
  save: "idle",
  theme: savedTheme(),
  toast: null,

  async init() {
    applyTheme(get().theme);
    let session: Session | null = null;
    try {
      session = await storage.getSession();
    } catch {
      session = null;
    }
    let ws: Workspace | null = null;
    if (session) {
      try {
        ws = upgradeWorkspace(await storage.loadWorkspace(session.team.id));
      } catch {
        ws = defaultWorkspace();
      }
    }
    set({ session, ws, ready: true });
  },

  async register(input) {
    const res = await storage.register(input);
    if (res.needsConfirm) return { needsConfirm: true };
    const session = res.session!;
    const loaded = await storage.loadWorkspace(session.team.id).catch(() => null);
    const ws = upgradeWorkspace(loaded);
    if (!loaded) await storage.saveWorkspace(session.team.id, ws).catch(() => {});
    set({ session, ws });
    return {};
  },

  async login(email, password) {
    const session = await storage.login(email, password);
    const loaded = await storage.loadWorkspace(session.team.id).catch(() => null);
    const ws = upgradeWorkspace(loaded);
    if (!loaded) await storage.saveWorkspace(session.team.id, ws).catch(() => {});
    set({ session, ws });
  },

  async logout() {
    clearTimeout(saveTimer);
    await storage.logout();
    set({ session: null, ws: null, save: "idle" });
  },

  update(fn) {
    const { ws, session } = get();
    if (!ws || !session) return;
    const next = { ...fn(ws), updatedAt: new Date().toISOString() };
    set({ ws: next, save: "saving" });
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      try {
        await storage.saveWorkspace(session.team.id, get().ws!);
        set({ save: "saved" });
      } catch (e) {
        set({ save: "error" });
        if (e instanceof AuthError) get().notify(e.code);
      }
    }, 700);
  },

  replaceWorkspace(ws) {
    get().update(() => upgradeWorkspace(ws));
  },

  setTheme(t) {
    try {
      localStorage.setItem("zg.theme", t);
    } catch {
      /* ignore */
    }
    applyTheme(t);
    set({ theme: t });
  },

  notify(msg) {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = window.setTimeout(() => set({ toast: null }), 2800);
  },
}));

export const isCloud = storage.kind === "cloud";
