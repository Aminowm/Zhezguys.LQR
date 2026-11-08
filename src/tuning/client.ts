import type { RobotProfile } from "../sim/robot";
import type { FullTune, TuneInputs } from "./tuner";
import type { CalibrationFit } from "./calibrate";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (v: any) => void>();
const fails = new Map<number, (e: Error) => void>();

function w() {
  if (!worker) {
    worker = new Worker(new URL("./tune.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data;
      if (ok) pending.get(id)?.(result);
      else fails.get(id)?.(new Error(error));
      pending.delete(id);
      fails.delete(id);
    };
  }
  return worker;
}

function call<T>(msg: object): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, resolve);
    fails.set(id, reject);
    w().postMessage({ ...msg, id });
  });
}

export const tuneRobot = (profile: RobotProfile, current?: TuneInputs) => call<FullTune>({ type: "tune", profile, current });
export const calibrateRobot = (profile: RobotProfile, samples: [number, number][], power: number) =>
  call<CalibrationFit>({ type: "calibrate", profile, samples, power });
