import { describe, it, expect } from "vitest";
import { DEFAULT_FILES, buildProgram } from "./defaults";
import { currentParams, applyGyroSettings, parseDefaults, evalSimple } from "./params";
import { routeToCode, routeSteps } from "../field/route";

describe("code helpers", () => {
  it("reads the team's current gains from the starter code", () => {
    const c = currentParams(DEFAULT_FILES);
    expect(c.lqr.K1).toBeCloseTo(5);
    expect(c.lqr.K2).toBeCloseTo(0.08);
    expect(c.db.turn_rate).toBeCloseTo(180);
    expect(c.pid.Kp).toBe(3);
    expect(parseDefaults(DEFAULT_FILES.lqr, "turnl_lqr").kd).toBeCloseTo(0.11);
    expect(evalSimple("50 * 3.6")).toBeCloseTo(180);
    expect(evalSimple("alert(1)")).toBeNull();
  });
  it("rewrites turn_gyro settings", () => {
    const h = applyGyroSettings(DEFAULT_FILES.helpers, 400, 600);
    expect(h).toContain("Drive_base.settings(turn_rate=400, turn_acceleration=600)");
    expect(currentParams({ ...DEFAULT_FILES, helpers: h }).db).toEqual({ turn_rate: 400, turn_acceleration: 600 });
  });
  it("maps errors back to the file and line", () => {
    const b = buildProgram(DEFAULT_FILES, "a = 1\nb = 2\n");
    const lines = b.code.split("\n");
    const idx = lines.indexOf("b = 2") + 1;
    expect(b.locate(idx)).toEqual({ file: "program", line: 2 });
  });
  it("turns a drawn route into turn/straight calls", () => {
    const start = { x: 200, y: 950, headingDeg: 0 };
    const pts: [number, number][] = [[200, 950], [700, 950], [700, 550]];
    const steps = routeSteps(pts, start);
    expect(steps.map((s) => Math.round(s.heading))).toEqual([0, -90]);
    const code = routeToCode(pts, start, 88);
    expect(code).toContain("turn_lqr(-90)");
    expect(code).toContain("straight_lqr(651, 60, 0)");
    // going back the way it came drives backwards instead of turning 180°
    const back = routeSteps([[200, 950], [700, 950], [300, 950]], start);
    expect(back[1].backwards).toBe(true);
    expect(Math.round(back[1].heading)).toBe(0);
  });
});
