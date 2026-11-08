// Main-thread side of the simulator worker.
import type { RunJob, RunOutput } from "./runner";
import { create } from "zustand";

type Status = "idle" | "loading" | "ready" | "running" | "error";
export const usePyStatus = create<{ status: Status; error?: string }>(() => ({ status: "idle" }));

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: number }>();

const base = () => new URL("./", document.baseURI).href;

function spawn() {
  worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const { id, type } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (type === "fail") {
      usePyStatus.setState({ status: "error", error: e.data.error });
      p.reject(new Error(e.data.error));
    } else {
      usePyStatus.setState({ status: "ready", error: undefined });
      p.resolve(type === "ready" ? true : e.data.results);
    }
  };
  worker.onerror = (e) => {
    usePyStatus.setState({ status: "error", error: e.message });
  };
  return worker;
}

function send<T>(msg: object, timeoutMs: number): Promise<T> {
  const w = worker ?? spawn();
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      // A pure-Python endless loop never gives control back: restart the worker.
      pending.delete(id);
      worker?.terminate();
      worker = null;
      for (const [, p] of pending) p.reject(new Error("RESTARTED"));
      pending.clear();
      usePyStatus.setState({ status: "idle" });
      reject(new Error("TIMEOUT"));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ ...msg, id, base: base() });
  });
}

export function warmPython() {
  if (usePyStatus.getState().status === "idle") {
    usePyStatus.setState({ status: "loading" });
    send<boolean>({ type: "warm" }, 120_000).catch(() => {});
  }
}

export async function runJobs(jobs: RunJob[]): Promise<RunOutput[]> {
  const st = usePyStatus.getState().status;
  if (st === "idle" || st === "error") usePyStatus.setState({ status: "loading" });
  else usePyStatus.setState({ status: "running" });
  // generous: first call includes downloading Python (~12 MB)
  const budget = (st === "ready" ? 15_000 : 90_000) + jobs.length * 8_000;
  return send<RunOutput[]>({ type: "run", jobs }, budget);
}
