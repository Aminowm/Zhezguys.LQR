import { describe, it, expect } from "vitest";
import { DEFAULT_PROFILE } from "../sim/robot";
import { tuneAll, yawModel, solveYawLqr, brysonWeights, applyDefaults } from "./tuner";
import { simTurnLqr, simTurnPid, simTurnGyro, LQR_DEFAULT, PID_DEFAULT, simStraightHold, STRAIGHT_LQR_DEFAULT, STRAIGHT_PID_DEFAULT, simStraightGyro, simMoveDeg } from "./controllers";

const brief = (m: any) => ({ ret: Math.round(m.returnMs), set: m.settleMs, over: +m.overshoot.toFixed(2), fin: +m.finalError.toFixed(2), to: m.timedOut });

describe("tuner", () => {
  it("default controllers on the default robot", () => {
    for (const a of [90, 30, 180]) {
      console.log(a, "LQR", brief(simTurnLqr(DEFAULT_PROFILE, a, LQR_DEFAULT)), "PID", brief(simTurnPid(DEFAULT_PROFILE, a, PID_DEFAULT)), "GYRO", brief(simTurnGyro(DEFAULT_PROFILE, a, { turn_rate: 180 })));
    }
    const s = (m: any) => ({ d: +m.distanceMm.toFixed(1), lat: +m.lateralMm.toFixed(1), h: +m.headingError.toFixed(2), t: Math.round(m.returnMs) });
    console.log("straight LQR", s(simStraightHold(DEFAULT_PROFILE, 1200, STRAIGHT_LQR_DEFAULT)), "PID", s(simStraightHold(DEFAULT_PROFILE, 1200, STRAIGHT_PID_DEFAULT)), "GYRO", s(simStraightGyro(DEFAULT_PROFILE, 921)), "OPEN", s(simMoveDeg(DEFAULT_PROFILE, 1200, 60)));
  });
  it("analytic lqr", () => {
    const m = yawModel(DEFAULT_PROFILE);
    console.log("model", m, solveYawLqr(m, brysonWeights()));
  });
  it("tunes everything quickly", () => {
    const r = tuneAll(DEFAULT_PROFILE);
    console.log("ms", Math.round(r.ms));
    console.log("LQR", r.lqr.signature, "K", r.lqr.params.K1.toFixed(2), r.lqr.params.K2.toFixed(3), "before", r.lqr.before.cost.toFixed(3), r.lqr.before.meanTime, r.lqr.before.meanOvershoot.toFixed(2), r.lqr.before.maxFinalError.toFixed(2), "after", r.lqr.after.cost.toFixed(3), r.lqr.after.meanTime, r.lqr.after.meanOvershoot.toFixed(2), r.lqr.after.maxFinalError.toFixed(2));
    console.log("PID", r.pid.params, "before", r.pid.before.cost.toFixed(3), r.pid.before.meanTime, "after", r.pid.after.cost.toFixed(3), r.pid.after.meanTime, r.pid.after.meanOvershoot.toFixed(2), r.pid.after.maxFinalError.toFixed(2));
    console.log("DB", r.db.params, "before", r.db.before.cost.toFixed(3), r.db.before.meanTime, "after", r.db.after.cost.toFixed(3), r.db.after.meanTime, r.db.after.meanOvershoot.toFixed(2), r.db.after.maxFinalError.toFixed(2));
    console.log("SL", r.straightLqr.params.K1, r.straightLqr.params.K2, r.straightLqr.before, r.straightLqr.after);
    console.log("SP", r.straightPid.params.Kp, r.straightPid.params.Kd, r.straightPid.before, r.straightPid.after);
    expect(r.lqr.after.cost).toBeLessThanOrEqual(r.lqr.before.cost);
    for (const heavy of [{ ...DEFAULT_PROFILE, massG: 1800, motor: "large" as const }, { ...DEFAULT_PROFILE, massG: 700, wheelDiameterMm: 56, axleTrackMm: 96 }]) {
      const t = tuneAll(heavy);
      console.log("profile", heavy.massG, heavy.motor, heavy.wheelDiameterMm, "LQR", t.lqr.signature, "after", t.lqr.after.meanTime, t.lqr.after.meanOvershoot.toFixed(2), t.lqr.after.maxFinalError.toFixed(2), "PID after", t.pid.after.meanTime, t.pid.after.meanOvershoot.toFixed(2), "DB after", t.db.params, t.db.after.meanTime, "ms", Math.round(t.ms));
    }
  });
  it("applies defaults in a signature", () => {
    const src = "def turn_lqr(GyroDeg, Q=1, R=0.01, b=2, kd=0.08,\n             Maxpower=80, Minpower=12):\n    pass\n";
    const r = applyDefaults(src, "turn_lqr", { b: 2.345678, kd: 0.1234, Minpower: 11 });
    expect(r.src).toContain("b=2.346, kd=0.123");
    expect(r.src).toContain("Minpower=11)");
  });
});

import { simulateCalibration, fitCalibration, parseCalibration, calibrationProgram } from "./calibrate";
describe("calibration", () => {
  it("recovers inertia and scrub from a spin test", () => {
    const truth = { ...DEFAULT_PROFILE, inertiaScale: 1.8, scrubScale: 2.5 };
    const times = Array.from({ length: 90 }, (_, i) => i * 10);
    const h = simulateCalibration(truth, 40, times);
    const text = "junk\nZG-CAL 40\n" + times.map((t, i) => `${t} ${h[i].toFixed(2)}`).join("\n") + "\nZG-END\n";
    const parsed = parseCalibration(text)!;
    const fit = fitCalibration(DEFAULT_PROFILE, parsed.samples, parsed.power);
    console.log("fit", fit.inertiaScale, fit.scrubScale, fit.rmsBefore.toFixed(2), fit.rmsAfter.toFixed(3));
    expect(fit.rmsAfter).toBeLessThan(0.5);
    expect(Math.abs(fit.inertiaScale - 1.8)).toBeLessThan(0.4);
    expect(calibrationProgram()).toContain("ZG-CAL");
  });
});
