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
    expect(lqr).toBeLessThan(pid);
    expect(lqr).toBeLessThan(gyro);
  });
  it("LQR drives straighter than PID and the gyro DriveBase", () => {
    const d = [600, 1200];
    const lat = (f: (mm: number, s: number) => { lateralMm: number }) => mean(d.map((mm, i) => Math.abs(f(mm, 31 + i).lateralMm)));
    const lqr = lat((mm, s) => simLqrStraight(DEFAULT_PROFILE, mm, undefined, undefined, s));
    const pid = lat((mm, s) => simPidStraight(DEFAULT_PROFILE, mm, undefined, undefined, s));
    const gyro = lat((mm, s) => simGyroStraight(DEFAULT_PROFILE, mm, undefined, s));
    console.log("straight |lateral|", { lqr, pid, gyro });
    expect(lqr).toBeLessThan(pid);
    expect(lqr).toBeLessThan(gyro);
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
