import { describe, it, expect } from "vitest";
import { DEFAULT_PROFILE } from "../sim/robot";
import { tuneAll } from "./tuner";
import { simLqrTurn, simPidTurn, simGyroTurn, simLqrStraight, simPidStraight, simGyroStraight } from "./controllers";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("controllers on the default robot", () => {
  it("LQR turns more accurately than PID and the gyro DriveBase", () => {
    const angles = [90, -90, 45, -45, 180, 30];
    const e = (f: (a: number, s: number) => { finalError: number }) => mean(angles.map((a, i) => Math.abs(f(a, 11 + i).finalError)));
    const lqr = e((a, s) => simLqrTurn(DEFAULT_PROFILE, a, 100, undefined, s));
    const pid = e((a, s) => simPidTurn(DEFAULT_PROFILE, a, 100, undefined, s));
    const gyro = e((a, s) => simGyroTurn(DEFAULT_PROFILE, a, 100, undefined, s));
    console.log("turn |err|", { lqr, pid, gyro });
    expect(lqr).toBeLessThan(pid / 3);
    expect(lqr).toBeLessThan(gyro / 3);
    // follows a plan, so no overshoot
    for (const a of angles) expect(simLqrTurn(DEFAULT_PROFILE, a).overshoot).toBeLessThan(0.5);
  });
  it("LQR stops closest to the planned end point", () => {
    const d = [300, 600, 1000, 1600];
    const runs = (f: (mm: number, s: number) => { lateralMm: number; distErr: number }) => d.map((mm, i) => f(mm, 31 + i));
    const lqr = runs((mm, s) => simLqrStraight(DEFAULT_PROFILE, mm, undefined, undefined, s));
    const pid = runs((mm, s) => simPidStraight(DEFAULT_PROFILE, mm, undefined, undefined, s));
    const gyro = runs((mm, s) => simGyroStraight(DEFAULT_PROFILE, mm, undefined, s));
    const end = (r: typeof lqr) => mean(r.map((x) => Math.hypot(x.distErr, x.lateralMm)));
    const lat = (r: typeof lqr) => mean(r.map((x) => Math.abs(x.lateralMm)));
    console.log("straight end-point", { lqr: end(lqr), pid: end(pid), gyro: end(gyro) }, "lateral", { lqr: lat(lqr), pid: lat(pid), gyro: lat(gyro) });
    expect(end(lqr)).toBeLessThan(end(gyro) / 2);
    expect(end(lqr)).toBeLessThan(end(pid) / 5);
    // side drift is limited by the gyro itself for both gyro-based methods
    expect(lat(lqr)).toBeLessThan(lat(pid));
    expect(lat(lqr)).toBeLessThan(lat(gyro) * 1.5);
  });
});

describe("tuner", () => {
  it("tunes everything quickly and PID does not get worse", () => {
    const res = tuneAll(DEFAULT_PROFILE);
    console.log("tuneAll ms", Math.round(res.ms), res.pid.params, res.gyro.params);
    expect(res.pid.after.cost).toBeLessThanOrEqual(res.pid.before.cost + 1e-9);
    expect(res.gyro.after.cost).toBeLessThanOrEqual(res.gyro.before.cost + 1e-9);
    expect(res.lqr.score.timeouts).toBe(0);
    expect(res.ms).toBeLessThan(20000);
  });
  it("adapts to a heavier robot", () => {
    const heavy = { ...DEFAULT_PROFILE, massG: DEFAULT_PROFILE.massG + 800 };
    const res = tuneAll(heavy);
    expect(res.lqr.score.meanFinalError).toBeLessThan(res.pid.before.meanFinalError);
  });
});
