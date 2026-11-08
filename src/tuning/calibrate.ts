// Calibration: teams run a 1-second spin test on their REAL robot, paste the
// printed log, and we fit the simulator's turning inertia and tyre scrub so
// that the simulated robot turns exactly like theirs.

import { Sim } from "../sim/physics";
import { RobotProfile } from "../sim/robot";

export const CAL_POWER = 40;

export function calibrationProgram(power = CAL_POWER) {
  return `# Zhezguys LQR Lab — calibration spin test
# 1. Put the robot on the mat with free space around it.
# 2. Run this program (your config.py lines must be above it).
# 3. Copy everything between ZG-CAL and ZG-END from the console.
P = ${power}
data = []
hub.imu.reset_heading(0)
wait(500)
sw = StopWatch()
motor_B.dc(P)
motor_F.dc(-P)
while sw.time() < 500:
    data.append((sw.time(), hub.imu.heading()))
    wait(10)
motor_B.brake()
motor_F.brake()
while sw.time() < 900:
    data.append((sw.time(), hub.imu.heading()))
    wait(10)
print("ZG-CAL", P)
for t, h in data:
    print(t, round(h, 2))
print("ZG-END")
`;
}

export function parseCalibration(text: string): { power: number; samples: [number, number][] } | null {
  const lines = text.split(/\r?\n/);
  let power = CAL_POWER;
  let on = false;
  const samples: [number, number][] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("ZG-CAL")) {
      on = true;
      const p = Number(line.split(/\s+/)[1]);
      if (Number.isFinite(p) && p > 0) power = p;
      continue;
    }
    if (line.startsWith("ZG-END")) break;
    if (!on) continue;
    const [a, b] = line.split(/[\s,;]+/).map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) samples.push([a, b]);
  }
  return samples.length >= 10 ? { power, samples } : null;
}

/** Same test, in the simulator. Returns heading at the requested times. */
export function simulateCalibration(profile: RobotProfile, power: number, times: number[]) {
  const sim = new Sim({ profile: { ...profile, gyroNoiseDeg: 0, gyroDriftDegPerMin: 0 }, start: { x: 1181, y: 571, headingDeg: 0 }, walls: false, maxTimeMs: 60000 });
  sim.motor("B", "counterclockwise");
  sim.motor("F", "clockwise");
  sim.gyroReset(0);
  sim.advance(500);
  const t0 = sim.now();
  sim.motorDc("B", power);
  sim.motorDc("F", -power);
  const out: number[] = [];
  let braked = false;
  for (const t of times) {
    while (sim.now() - t0 < t) {
      if (!braked && sim.now() - t0 >= 500) {
        sim.motorStop("B", "brake");
        sim.motorStop("F", "brake");
        braked = true;
      }
      sim.advance(1);
    }
    out.push(sim.gyroHeading());
  }
  return out;
}

export interface CalibrationFit {
  inertiaScale: number;
  scrubScale: number;
  rmsBefore: number;
  rmsAfter: number;
  times: number[];
  measured: number[];
  simBefore: number[];
  simAfter: number[];
}

function rms(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / Math.max(1, a.length));
}

export function fitCalibration(profile: RobotProfile, samples: [number, number][], power: number): CalibrationFit {
  // the hub may report clockwise turns as negative if the motors are swapped
  const sign = samples[samples.length - 1][1] < 0 ? -1 : 1;
  const times = samples.map((s) => s[0]);
  const measured = samples.map((s) => s[1] * sign);
  const base = { ...profile, inertiaScale: 1, scrubScale: 1 };
  const simBefore = simulateCalibration({ ...profile }, power, times);
  let best = { i: profile.inertiaScale ?? 1, s: profile.scrubScale ?? 1, e: rms(simBefore, measured) };
  const tryOne = (i: number, s: number) => {
    const e = rms(simulateCalibration({ ...base, inertiaScale: i, scrubScale: s }, power, times), measured);
    if (e < best.e) best = { i, s, e };
  };
  for (const i of [0.5, 0.75, 1, 1.4, 2, 2.8]) for (const s of [0.4, 0.7, 1, 1.5, 2.2, 3.2, 4.5]) tryOne(i, s);
  // pattern search: keep the step while it helps, halve it when it doesn't
  let di = 0.25;
  let ds = 0.4;
  for (let k = 0; k < 80 && (di > 0.004 || ds > 0.006); k++) {
    const { i, s, e } = best;
    for (const [a, b] of [[di, 0], [-di, 0], [0, ds], [0, -ds], [di, ds], [-di, -ds], [di, -ds], [-di, ds]]) {
      tryOne(Math.min(4, Math.max(0.3, i + a)), Math.min(6, Math.max(0.2, s + b)));
    }
    if (best.e >= e) {
      di *= 0.5;
      ds *= 0.5;
    }
  }
  const simAfter = simulateCalibration({ ...base, inertiaScale: best.i, scrubScale: best.s }, power, times);
  return {
    inertiaScale: +best.i.toFixed(2),
    scrubScale: +best.s.toFixed(2),
    rmsBefore: rms(simBefore, measured),
    rmsAfter: rms(simAfter, measured),
    times,
    measured,
    simBefore,
    simAfter,
  };
}
