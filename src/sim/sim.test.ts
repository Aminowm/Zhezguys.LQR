import { describe, it, expect, beforeAll } from "vitest";
import { loadPyodide } from "pyodide";
import { Runner } from "./runner";
import { DEFAULT_PROFILE } from "./robot";
import { DEFAULT_FILES, DEFAULT_PROGRAM, buildProgram, buildHubProgram } from "../code/defaults";

let runner: Runner;
const center = { x: 1181, y: 571, headingDeg: 0 };
const startL = { x: 300, y: 571, headingDeg: 0 };

beforeAll(async () => {
  const py = await loadPyodide();
  runner = new Runner(py as any);
}, 60000);

function run(body: string, start = center, seed = 7) {
  const { code } = buildProgram(DEFAULT_FILES, body);
  return runner.run({ code, profile: DEFAULT_PROFILE, start, maxTimeMs: 20000, walls: false, seed });
}

describe("starter code in the simulator", () => {
  it("turns with LQR, PID and the Pybricks gyro", () => {
    const res: Record<string, number[]> = {};
    for (const c of ["LQR", "PID", "GYRO"]) {
      res[c] = [];
      for (const [i, a] of [90, -90, 45, -45, 180, 30].entries()) {
        const out = run(`CONTROLLER = "${c}"\nturn(${a})\n`, center, 11 + i);
        expect(out.runError, JSON.stringify(out.runError)).toBeUndefined();
        const f = out.frames;
        res[c].push(Math.abs(f.h[f.h.length - 1] - f.h[0] - a));
      }
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    console.log("turn mean |err|", Object.fromEntries(Object.entries(res).map(([k, v]) => [k, +mean(v).toFixed(3)])), "max", Object.fromEntries(Object.entries(res).map(([k, v]) => [k, +Math.max(...v).toFixed(2)])));
  });
  it("drives straight with LQR, PID and the Pybricks gyro", () => {
    for (const c of ["LQR", "PID", "GYRO"]) {
      const rows = [300, 600, 1000, 1600].map((mm, i) => {
        const out = run(`CONTROLLER = "${c}"\nstraight(${mm}, **NORMAL)\n`, startL, 21 + i);
        expect(out.runError, JSON.stringify(out.runError)).toBeUndefined();
        const f = out.frames;
        const n = f.t.length - 1;
        return { dist: +(f.x[n] - f.x[0] - mm).toFixed(1), lat: +(f.y[n] - f.y[0]).toFixed(1), h: +(f.h[n] - f.h[0]).toFixed(2), ms: out.programEndMs };
      });
      console.log(c, JSON.stringify(rows));
    }
  });
  it("runs the example program and the battery menu code", () => {
    const out = run(DEFAULT_PROGRAM, { x: 391, y: 963, headingDeg: 0 });
    expect(out.runError, JSON.stringify(out.runError)).toBeUndefined();
    console.log("example ends", out.finalPose);
    const hub = buildHubProgram(DEFAULT_FILES, [{ name: "Program 1", code: DEFAULT_PROGRAM }, { name: "Program 2", code: "# prg 2\n" }]);
    expect(hub).toContain("elif prg == 2:");
    // the menu waits for buttons forever: it must stop at the time limit without errors
    const m = runner.run({ code: hub, profile: DEFAULT_PROFILE, start: center, maxTimeMs: 1500 });
    expect(m.runError, JSON.stringify(m.runError)).toBeUndefined();
    expect(m.timeOver).toBe(true);
  });
  it("reports errors with line numbers", () => {
    const b = buildProgram(DEFAULT_FILES, "turn(10)\nfoo()\n");
    const out = runner.run({ code: b.code, profile: DEFAULT_PROFILE, start: center });
    expect(out.runError?.type).toBe("NameError");
    expect(b.locate(out.runError!.line)).toEqual({ file: "program", line: 2 });
  });
});
