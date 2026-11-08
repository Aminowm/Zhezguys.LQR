/// <reference lib="webworker" />
import { tuneAll } from "./tuner";
import { fitCalibration } from "./calibrate";

self.onmessage = (e: MessageEvent) => {
  const { id, type, profile, samples, power, current } = e.data;
  try {
    if (type === "tune") self.postMessage({ id, ok: true, result: tuneAll(profile, current) });
    else if (type === "calibrate") self.postMessage({ id, ok: true, result: fitCalibration(profile, samples, power) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
