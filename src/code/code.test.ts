import { describe, it, expect } from "vitest";
import { DEFAULT_FILES, buildProgram, buildHubProgram, DEFAULT_PROGRAM, emptyProgram } from "./defaults";
import { applyConstants, applyModel, currentSettings, evalSimple, hasNewApi, readConstant } from "./params";
import { routeToCode, routeSteps } from "../field/route";
import { DEFAULT_PROFILE } from "../sim/robot";
import { modelConstants } from "../tuning/controllers";

describe("code helpers", () => {
  it("reads the team's current settings from the starter code", () => {
    const c = currentSettings(DEFAULT_FILES);
    expect(c.pid.PID_KP).toBeCloseTo(3);
    expect(c.pid.PID_MINPOWER).toBe(12);
    expect(c.gyro.GYRO_TURN_RATE).toBe(180);
    expect(c.lqr.TURN_TOL).toBeCloseTo(0.2);
    expect(evalSimple("50 * 3.6")).toBeCloseTo(180);
    expect(evalSimple("alert(1)")).toBeNull();
    expect(hasNewApi(DEFAULT_FILES)).toBe(true);
  });
  it("rewrites constants but keeps comments", () => {
    const r = applyConstants(DEFAULT_FILES.pid, { PID_KP: 2.5, PID_KD: 0.2 });
    expect(r.changed).toEqual(["PID_KP", "PID_KD"]);
    expect(readConstant(r.src, "PID_KP")).toBeCloseTo(2.5);
    expect(readConstant(r.src, "PID_KD")).toBeCloseTo(0.2);
    expect(r.src).toContain("#");
  });
  it("writes the robot model into config.py", () => {
    const heavy = { ...DEFAULT_PROFILE, massG: DEFAULT_PROFILE.massG + 600 };
    const cfg = applyModel(DEFAULT_FILES.config, heavy);
    const m = modelConstants(heavy);
    expect(readConstant(cfg, "YAW_B")).toBeCloseTo(m.YAW_B, 1);
    expect(readConstant(cfg, "LIN_B")).toBeCloseTo(m.LIN_B, 1);
  });
  it("maps errors back to the file and line", () => {
    const b = buildProgram(DEFAULT_FILES, "a = 1\nb = 2\n");
    const lines = b.code.split("\n");
    const idx = lines.indexOf("b = 2") + 1;
    expect(b.locate(idx)).toEqual({ file: "program", line: 2 });
  });
  it("assembles the hub menu from the programs", () => {
    const code = buildHubProgram(DEFAULT_FILES, [
      { name: "Run 1", code: DEFAULT_PROGRAM },
      { name: "Run 2", code: emptyProgram(2) },
    ]);
    expect(code).toContain("max_prg = 2");
    expect(code).toContain("elif prg == 1:");
    expect(code).toContain("elif prg == 2:");
    expect(code).toContain("except SystemExit");
  });
  it("turns a drawn route into turn/straight calls", () => {
    const start = { x: 200, y: 950, headingDeg: 0 };
    const pts: [number, number][] = [[200, 950], [700, 950], [700, 550]];
    const steps = routeSteps(pts, start);
    expect(steps.map((s) => Math.round(s.heading))).toEqual([0, -90]);
    const code = routeToCode(pts, start);
    expect(code).toContain("turn(-90)");
    expect(code).toContain("straight(500, **NORMAL)");
    // going back the way it came drives backwards instead of turning 180°
    const back = routeSteps([[200, 950], [700, 950], [300, 950]], start);
    expect(back[1].backwards).toBe(true);
    expect(Math.round(back[1].heading)).toBe(0);
  });
});
