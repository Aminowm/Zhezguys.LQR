/// <reference lib="webworker" />
// Web worker: loads Python (Pyodide) once and runs teams' programs in the simulator.
import { Runner, RunJob } from "./runner";

let runner: Promise<Runner> | null = null;

function getRunner(base: string) {
  if (!runner) {
    runner = (async () => {
      const mod = await import(/* @vite-ignore */ `${base}pyodide/pyodide.mjs`);
      const py = await mod.loadPyodide({ indexURL: `${base}pyodide/` });
      return new Runner(py);
    })();
  }
  return runner;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: string; id: number; base: string; jobs?: RunJob[] };
  try {
    const r = await getRunner(msg.base);
    if (msg.type === "warm") {
      self.postMessage({ type: "ready", id: msg.id });
      return;
    }
    const results = (msg.jobs ?? []).map((j) => r.run(j));
    self.postMessage({ type: "result", id: msg.id, results });
  } catch (err) {
    runner = null;
    self.postMessage({ type: "fail", id: msg.id, error: String((err as Error)?.message ?? err) });
  }
};
