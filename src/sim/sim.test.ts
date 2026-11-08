import { describe, it, expect, beforeAll } from "vitest";
import { loadPyodide } from "pyodide";
import { Runner } from "./runner";
import { DEFAULT_PROFILE } from "./robot";
import { DEFAULT_FILES, buildProgram } from "../code/defaults";

let runner: Runner;
const start = { x: 300, y: 600, headingDeg: 0 };

function metrics(out: any, target: number) {
  const g = out.frames.h as number[];
  const t = out.frames.t as number[];
  const h0 = g[0];
  let peak = 0;
  for (const h of g) peak = Math.max(peak, (h - h0) * Math.sign(target));
  const final = g[g.length - 1] - h0;
  // settle: last time |err|>1
  let settle = 0;
  for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - h0 - target) > 1) settle = t[i];
  return { final: +final.toFixed(2), overshoot: +(peak - Math.abs(target)).toFixed(2), settle, end: out.endTime, err: out.runError };
}

beforeAll(async () => {
  const py = await loadPyodide();
  runner = new Runner(py as any);
}, 60000);

describe("simulator", () => {
  it("runs the three turn controllers", () => {
    for (const body of ["Gyro_reset(0)\nturn_lqr(90)", "Gyro_reset(0)\nturn_pid(90)", "Gyro_reset(0)\nturn_gyro(90)", "Gyro_reset(0)\nturnl_lqr(90)"]) {
      const { code } = buildProgram(DEFAULT_FILES, body);
      const out = runner.run({ code, profile: DEFAULT_PROFILE, start, maxTimeMs: 10000 });
      console.log(body.split("\n")[1], JSON.stringify(metrics(out, 90)), out.events.slice(0, 3));
      expect(out.runError).toBeUndefined();
    }
  });
  it("drives straight", () => {
    for (const body of ["Gyro_reset(0)\nstraight_lqr(1000, 60, 0)", "Gyro_reset(0)\nstraight_pid(1000, 60, 0)", "Gyro_reset(0)\nstraight_gyro(round(1000/360*3.14159*88))", "Gyro_reset(0)\nmove_deg(60, 60, 1000)"]) {
      const { code } = buildProgram(DEFAULT_FILES, body);
      const out = runner.run({ code, profile: DEFAULT_PROFILE, start, maxTimeMs: 10000 });
      const f = out.finalPose;
      console.log(body.split("\n")[1], "x", f.x.toFixed(1), "y", f.y.toFixed(1), "h", f.headingDeg.toFixed(2), "t", out.endTime, out.runError);
      expect(out.runError).toBeUndefined();
    }
  });
  it("reports errors with line numbers", () => {
    const b = buildProgram(DEFAULT_FILES, "Gyro_reset(0)\nfoo()\n");
    const out = runner.run({ code: b.code, profile: DEFAULT_PROFILE, start });
    expect(out.runError?.type).toBe("NameError");
    expect(b.locate(out.runError!.line)).toEqual({ file: "program", line: 2 });
  });
  it("stops infinite loops with wait at the time limit", () => {
    const b = buildProgram(DEFAULT_FILES, "while True:\n    wait(10)\n");
    const out = runner.run({ code: b.code, profile: DEFAULT_PROFILE, start, maxTimeMs: 3000 });
    expect(out.timeOver).toBe(true);
  });
  it("move_time busy loop terminates", () => {
    const b = buildProgram(DEFAULT_FILES, "move_time(50, 50, 1000)\n");
    const out = runner.run({ code: b.code, profile: DEFAULT_PROFILE, start, maxTimeMs: 5000 });
    console.log("move_time", out.finalPose, out.endTime);
    expect(out.runError).toBeUndefined();
    expect(out.timeOver).toBe(false);
  });
});
